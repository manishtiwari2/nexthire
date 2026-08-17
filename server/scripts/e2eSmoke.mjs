// End-to-end smoke test against a RUNNING server.
//
// Unit tests (`npm test`) cover the pure logic. This drives the real HTTP API instead:
// registration and email verification, login/refresh/logout, question authoring, Run vs
// Submit, all five verdicts from real execution, hidden-test-case leakage on every read path,
// contest join/score/leaderboard/expiry, cross-user IDOR probes, and malformed-input handling.
//
// It needs a server running with the console mailer, because it reads the verification and
// reset links out of the server's stdout — point SERVER_LOG at the file you redirected it to.
//
//   # terminal 1
//   PORT=5099 MAIL_PROVIDER=console EMAIL_VERIFICATION_REQUIRED=true \
//     ADMIN_EMAILS=audit-admin@nexthire.test DISABLE_RATE_LIMIT=1 \
//     npm start > /tmp/nexthire.log 2>&1
//
//   # terminal 2
//   API_BASE=http://127.0.0.1:5099/api/v1 SERVER_LOG=/tmp/nexthire.log \
//     node scripts/e2eSmoke.mjs
//
// DISABLE_RATE_LIMIT=1 is required or the run trips the auth limiter partway through; the
// server refuses to boot with that flag in production, so it cannot leak into a deployment.
// Point DATABASE_URL at a scratch database — this writes users, submissions and contests.
//
// Takes about two minutes: it waits out a real 90-second contest window to prove that
// submissions are refused after expiry.

import fs from 'node:fs';

const API = process.env.API_BASE || 'http://127.0.0.1:5099/api/v1';
const LOG = process.env.SERVER_LOG;

let pass = 0, fail = 0;
const failures = [];
const notes = [];

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(`${name} :: ${detail}`); console.log(`  FAIL  ${name}  ${detail}`); }
}
function note(msg) { notes.push(msg); console.log(`  ..    ${msg}`); }
function section(t) { console.log(`\n=== ${t} ===`); }

// --- HTTP with per-actor cookie jar -----------------------------------------
class Actor {
  constructor(label) { this.label = label; this.cookies = new Map(); this.token = null; }
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res) {
    const raw = res.headers.getSetCookie?.() || [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (v === '' ) this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }
  async req(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token && !opts.noAuth) headers.Authorization = `Bearer ${this.token}`;
    if (opts.rawAuth) headers.Authorization = opts.rawAuth;
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    const csrf = this.cookies.get('nh_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
    Object.assign(headers, opts.headers || {});
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : (opts.rawBody ? body : JSON.stringify(body)),
    });
    this.absorb(res);
    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 400) }; }
    return { status: res.status, body: json, headers: res.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b, o) { return this.req('POST', p, b, o); }
  patch(p, b, o) { return this.req('PATCH', p, b, o); }
  put(p, b, o) { return this.req('PUT', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLog() { try { return fs.readFileSync(LOG, 'utf8'); } catch { return ''; } }

async function verificationTokenFor(email) {
  for (let i = 0; i < 40; i++) {
    const log = readLog();
    // find the last mail block addressed to this email
    const blocks = log.split('📧');
    for (let b = blocks.length - 1; b >= 0; b--) {
      if (blocks[b].includes(`To      : ${email}`) && blocks[b].includes('verify-email?token=')) {
        const m = /verify-email\?token=([A-Za-z0-9_\-%]+)/.exec(blocks[b]);
        if (m) return decodeURIComponent(m[1]);
      }
    }
    await sleep(250);
  }
  return null;
}
async function resetTokenFor(email) {
  for (let i = 0; i < 40; i++) {
    const log = readLog();
    const blocks = log.split('📧');
    for (let b = blocks.length - 1; b >= 0; b--) {
      if (blocks[b].includes(`To      : ${email}`) && blocks[b].includes('reset-password?token=')) {
        const m = /reset-password\?token=([A-Za-z0-9_\-%]+)/.exec(blocks[b]);
        if (m) return decodeURIComponent(m[1]);
      }
    }
    await sleep(250);
  }
  return null;
}

let mobileSeq = 0;
function nextMobile() {
  mobileSeq += 1;
  return `+9199${String(Date.now()).slice(-6)}${String(mobileSeq).padStart(2, '0')}`;
}
async function register(actor, { name, email, password, mobile }) {
  const r = await actor.post('/auth/register', {
    name, email, password, confirmPassword: password,
    mobile: mobile || nextMobile(),
  });
  return r;
}

async function login(actor, email, password) {
  const r = await actor.post('/auth/login', { email, password });
  if (r.body?.data?.accessToken) actor.token = r.body.data.accessToken;
  return r;
}

// Poll a submission until it reaches a terminal state.
const TERMINAL = new Set(['ACCEPTED','WRONG_ANSWER','TIME_LIMIT_EXCEEDED','MEMORY_LIMIT_EXCEEDED',
  'OUTPUT_LIMIT_EXCEEDED','COMPILATION_ERROR','RUNTIME_ERROR','INTERNAL_ERROR','CANCELLED']);
async function verdictOf(actor, submissionId, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await actor.get(`/submissions/${submissionId}/result`);
    const d = r.body?.data;
    if (d && !d.pending && TERMINAL.has(d.status)) return d;
    await sleep(300);
  }
  return { status: 'TIMEOUT_WAITING' };
}

// --- Test programs ----------------------------------------------------------
// Question: read two integers on one line, print their sum.
const PY_CORRECT   = 'a, b = map(int, input().split())\nprint(a + b)';
const PY_WRONG     = 'a, b = map(int, input().split())\nprint(a - b)';
const PY_SYNTAX    = 'def broken(:\n  print("nope"';
const PY_RUNTIME   = 'a, b = map(int, input().split())\nprint(a // 0)';
const PY_INFINITE  = 'while True:\n    pass';

const ADMIN_EMAIL = process.env.AUDIT_ADMIN_EMAIL || 'audit-admin@nexthire.test';
const PW = 'Aud1t!Passw0rd#2026';

const admin = new Actor('admin');
const alice = new Actor('alice');
const bob   = new Actor('bob');
const anon  = new Actor('anon');

const aliceEmail = `alice.${Date.now()}@nexthire.test`;
const bobEmail   = `bob.${Date.now()}@nexthire.test`;

let questionId = null;
let contestId = null;

async function main() {
  section('PHASE 8 — registration, verification, login');

  const rAdmin = await register(admin, { name: 'Audit Admin', email: ADMIN_EMAIL, password: PW });
  // 409 just means a previous audit run already created this account.
  ok('register admin returns 201 (or 409 if the audit admin already exists)',
     [201, 409].includes(rAdmin.status), `got ${rAdmin.status} ${JSON.stringify(rAdmin.body).slice(0,200)}`);

  const rAlice = await register(alice, { name: 'Alice Tester', email: aliceEmail, password: PW });
  ok('register user A returns 201', rAlice.status === 201, `got ${rAlice.status}`);
  const rBob = await register(bob, { name: 'Bob Tester', email: bobEmail, password: PW });
  ok('register user B returns 201', rBob.status === 201, `got ${rBob.status}`);

  // password policy
  const weak = await new Actor('weak').post('/auth/register', { name: 'Weak Person', email: `weak.${Date.now()}@nexthire.test`, mobile: nextMobile(), password: '123', confirmPassword: '123' });
  ok('weak password rejected', [400,422].includes(weak.status), `got ${weak.status}`);

  // duplicate email
  const dup = await register(new Actor('dup'), { name: 'Dup Person', email: aliceEmail, password: PW });
  ok('duplicate email rejected (not 201)', dup.status !== 201, `got ${dup.status}`);

  // email verification
  for (const [actor, email, label] of [[admin, ADMIN_EMAIL, 'admin'], [alice, aliceEmail, 'A'], [bob, bobEmail, 'B']]) {
    const token = await verificationTokenFor(email);
    ok(`verification token emailed for ${label}`, Boolean(token), 'no token found in server log');
    if (token) {
      const v = await actor.post('/auth/verify-email', { token });
      ok(`email verified for ${label}`, v.status === 200, `got ${v.status} ${JSON.stringify(v.body).slice(0,160)}`);
      const again = await actor.post('/auth/verify-email', { token });
      ok(`verification token is single-use (${label})`, again.status !== 200 || again.body?.data?.alreadyVerified, `got ${again.status}`);
    }
  }

  // wrong password
  const bad = await new Actor('bad').post('/auth/login', { email: aliceEmail, password: 'WrongPassword123!' });
  ok('wrong password rejected', bad.status === 401, `got ${bad.status}`);

  const la = await login(alice, aliceEmail, PW);
  ok('user A login ok', la.status === 200 && Boolean(alice.token), `got ${la.status}`);
  const lbob = await login(bob, bobEmail, PW);
  ok('user B login ok', lbob.status === 200 && Boolean(bob.token), `got ${lbob.status}`);
  const ladm = await login(admin, ADMIN_EMAIL, PW);
  ok('admin login ok', ladm.status === 200 && Boolean(admin.token), `got ${ladm.status}`);

  const me = await admin.get('/auth/me');
  ok('admin resolves to ADMIN role', me.body?.data?.role === 'ADMIN' || me.body?.data?.user?.role === 'ADMIN',
     `role=${JSON.stringify(me.body?.data || {}).slice(0,200)}`);
  const meA = await alice.get('/auth/me');
  const aliceRole = meA.body?.data?.role || meA.body?.data?.user?.role;
  ok('user A resolves to USER role', aliceRole === 'USER', `role=${aliceRole}`);
  const meJson = JSON.stringify(meA.body || {});
  ok('/auth/me never returns passwordHash', !meJson.includes('passwordHash'), 'passwordHash present');

  // refresh
  const refreshed = await alice.post('/auth/refresh', {});
  ok('token refresh works', refreshed.status === 200 && Boolean(refreshed.body?.data?.accessToken), `got ${refreshed.status}`);
  if (refreshed.body?.data?.accessToken) alice.token = refreshed.body.data.accessToken;

  // invalid / malformed JWT
  const badJwt = await alice.get('/auth/me', { rawAuth: 'Bearer not.a.jwt' });
  ok('malformed JWT rejected 401', badJwt.status === 401, `got ${badJwt.status}`);
  const noAuth = await anon.get('/auth/me');
  ok('missing token rejected 401', noAuth.status === 401, `got ${noAuth.status}`);

  section('PHASE 8 — authorization boundaries');
  const uCreate = await alice.post('/questions', { title: 'Should not exist', description: 'x', constraints: 'x' });
  ok('normal user cannot create questions (403)', uCreate.status === 403, `got ${uCreate.status}`);
  const uAdminList = await alice.get('/auth/admin/users');
  ok('normal user cannot list users (403)', uAdminList.status === 403, `got ${uAdminList.status}`);
  const uContest = await alice.post('/contests', { title: 'nope', description: 'nope' });
  ok('normal user cannot create a contest (403)', uContest.status === 403, `got ${uContest.status}`);
  if (uContest.status === 403) note('PRODUCT GAP: goal #4 says a USER creates their own contest; server requires ADMIN');

  section('PHASE 6 — author a real, solvable question');
  const qBody = {
    title: `Audit Sum ${Date.now()}`,
    difficulty: 'EASY',
    topicName: 'Arrays',
    description: '## Sum Two Numbers\n\nRead two space-separated integers and print their sum.\n\n```\nInput: 1 2\nOutput: 3\n```',
    constraints: '-10^9 <= a, b <= 10^9',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    starterCodes: [
      { language: 'PYTHON', template: '# read a and b\n' },
      { language: 'JAVA', template: 'public class Main { public static void main(String[] a){} }' },
    ],
    testCases: [
      { input: '1 2', expectedOutput: '3', isSample: true, orderIndex: 0, explanation: '1+2=3' },
      { input: '10 20', expectedOutput: '30', isSample: false, orderIndex: 1 },
      { input: '-5 5', expectedOutput: '0', isSample: false, orderIndex: 2 },
      { input: '999999999 1', expectedOutput: '1000000000', isSample: false, orderIndex: 3 },
    ],
    hints: [{ content: 'Split the line, cast to int.' }],
    editorialContent: 'Parse and add.',
    editorialSolution: 'print(sum(map(int,input().split())))',
  };
  const created = await admin.post('/questions', qBody);
  ok('admin creates question (201)', created.status === 201, `got ${created.status} ${JSON.stringify(created.body).slice(0,200)}`);
  questionId = created.body?.data?.id;

  const qAsUser = await alice.get(`/questions/${questionId}`);
  ok('question readable by user', qAsUser.status === 200, `got ${qAsUser.status}`);
  const tcs = qAsUser.body?.data?.testCases || [];
  ok('user only sees SAMPLE test cases on the question', tcs.length === 1 && tcs[0].isSample === true,
     `saw ${tcs.length} cases: ${JSON.stringify(tcs.map(t=>t.isSample))}`);
  const qJson = JSON.stringify(qAsUser.body);
  ok('hidden test inputs not present in question payload', !qJson.includes('999999999'), 'hidden input leaked');
  ok('question has description/constraints/hints/starterCodes',
     Boolean(qAsUser.body?.data?.description && qAsUser.body?.data?.constraints
             && (qAsUser.body?.data?.hints||[]).length && (qAsUser.body?.data?.starterCodes||[]).length),
     'missing content fields');

  section('PHASE 5/7 — Run vs Submit and every verdict');

  // RUN — sample only
  const run = await alice.post(`/questions/${questionId}/execute`, { code: PY_CORRECT, language: 'PYTHON', mode: 'run' });
  ok('run accepted (queued)', run.status === 200, `got ${run.status} ${JSON.stringify(run.body).slice(0,200)}`);
  const runV = await verdictOf(alice, run.body?.data?.submissionId);
  ok('RUN -> ACCEPTED', runV.status === 'ACCEPTED', `got ${runV.status} ${JSON.stringify(runV).slice(0,300)}`);
  ok('RUN executed sample cases only (totalTests===1)', runV.totalTests === 1, `totalTests=${runV.totalTests}`);

  const histAfterRun = await alice.get(`/questions/${questionId}/submissions`);
  ok('RUN does not appear in submission history', (histAfterRun.body?.data || []).length === 0,
     `history length ${(histAfterRun.body?.data||[]).length}`);

  const cases = [
    ['ACCEPTED', PY_CORRECT],
    ['WRONG_ANSWER', PY_WRONG],
    ['COMPILATION_ERROR', PY_SYNTAX],
    ['RUNTIME_ERROR', PY_RUNTIME],
    ['TIME_LIMIT_EXCEEDED', PY_INFINITE],
  ];
  const submissionIds = {};
  for (const [expected, code] of cases) {
    const s = await alice.post(`/questions/${questionId}/execute`, { code, language: 'PYTHON', mode: 'submit' });
    if (s.status !== 200) { ok(`submit for ${expected} accepted`, false, `got ${s.status}`); continue; }
    const id = s.body.data.submissionId;
    submissionIds[expected] = id;
    const v = await verdictOf(alice, id);
    ok(`SUBMIT -> ${expected}`, v.status === expected, `got ${v.status} :: ${JSON.stringify(v).slice(0,300)}`);
    if (expected === 'ACCEPTED') {
      ok('ACCEPTED ran all 4 test cases', v.totalTests === 4, `totalTests=${v.totalTests}`);
    }
  }

  section('PHASE 14 — hidden test-case leakage on every submission read path');
  const accId = submissionIds['WRONG_ANSWER'];
  if (accId) {
    const paths = [
      `/submissions/${accId}`,
      `/submissions/${accId}/result`,
      `/questions/submission/${accId}`,
    ];
    for (const p of paths) {
      const r = await alice.get(p);
      const j = JSON.stringify(r.body || {});
      const leaked = j.includes('999999999') || j.includes('1000000000') || j.includes('"isSample":false');
      ok(`no hidden test data via GET ${p}`, !leaked, `LEAK in response (${j.length} bytes)`);
    }
    const hist = await alice.get(`/questions/${questionId}/submissions`);
    const hj = JSON.stringify(hist.body || {});
    ok('no hidden test data via GET /questions/:id/submissions',
       !(hj.includes('999999999') || hj.includes('"isSample":false')), 'LEAK in history response');
  }

  section('PHASE 5 — submission history & progress');
  const hist = await alice.get(`/questions/${questionId}/submissions`);
  ok('history contains the 5 real submissions', (hist.body?.data || []).length === 5,
     `got ${(hist.body?.data||[]).length}`);
  const prog = await alice.get('/library/progress/stats');
  ok('progress marks the question SOLVED', (prog.body?.data?.solvedTotal || 0) >= 1,
     `solvedTotal=${prog.body?.data?.solvedTotal}`);
  const rq = await alice.get('/revision/queue');
  ok('revision schedule auto-created on first solve', rq.status === 200, `got ${rq.status}`);

  section('PHASE 9 — multi-user data isolation (IDOR)');
  const bobReads = await bob.get(`/submissions/${submissionIds['ACCEPTED']}`);
  ok('user B cannot read user A submission (403)', bobReads.status === 403, `got ${bobReads.status}`);
  const bobReads2 = await bob.get(`/questions/submission/${submissionIds['ACCEPTED']}`);
  ok('user B cannot read A submission via question route (403)', bobReads2.status === 403, `got ${bobReads2.status}`);
  const bobList = await bob.get(`/submissions?userId=${encodeURIComponent('any')}&questionId=${questionId}`);
  ok('user B submission list is scoped to self', (bobList.body?.data || []).length === 0,
     `got ${(bobList.body?.data||[]).length} rows`);
  const bobCancel = await bob.post(`/submissions/${submissionIds['ACCEPTED']}/cancel`, {});
  ok('user B cannot cancel A submission', bobCancel.status === 403 || bobCancel.status === 409, `got ${bobCancel.status}`);
  const bobRejudge = await bob.post(`/submissions/${submissionIds['ACCEPTED']}/rejudge`, {});
  ok('user B cannot rejudge (403)', bobRejudge.status === 403, `got ${bobRejudge.status}`);
  const bobNote = await bob.get(`/library/notes/${questionId}`);
  const aliceNote = await alice.put(`/library/notes/${questionId}`, { approach: 'ALICE-PRIVATE-NOTE' });
  const bobNote2 = await bob.get(`/library/notes/${questionId}`);
  ok('private notes are per-user', !JSON.stringify(bobNote2.body).includes('ALICE-PRIVATE-NOTE'),
     'user B saw user A note');

  section('PHASE 5 — contest lifecycle, scoring and expiry');
  const now = Date.now();
  const c = await admin.post('/contests', {
    title: `Audit Contest ${now}`,
    description: 'Audit run',
    startTime: new Date(now - 1000).toISOString(),
    endTime: new Date(now + 90 * 1000).toISOString(),
    questionIds: [questionId],
  });
  ok('admin creates contest (201)', c.status === 201, `got ${c.status} ${JSON.stringify(c.body).slice(0,200)}`);
  contestId = c.body?.data?.id;
  const joinCode = c.body?.data?.joinCode;

  const preJoinSubmit = await alice.post(`/contests/${contestId}/submit`, { questionId, code: PY_CORRECT, language: 'PYTHON' });
  ok('non-participant cannot submit to contest (403)', preJoinSubmit.status === 403, `got ${preJoinSubmit.status}`);

  const join = await alice.post('/contests/join-by-code', { code: joinCode });
  ok('user A joins by code', join.status === 200, `got ${join.status} ${JSON.stringify(join.body).slice(0,200)}`);

  const cs = await alice.post(`/contests/${contestId}/submit`, { questionId, code: PY_CORRECT, language: 'PYTHON' });
  ok('contest submit accepted', cs.status === 200, `got ${cs.status} ${JSON.stringify(cs.body).slice(0,200)}`);
  const csv = await verdictOf(alice, cs.body?.data?.submissionId);
  ok('contest submission -> ACCEPTED', csv.status === 'ACCEPTED', `got ${csv.status}`);

  await sleep(500);
  const lb = await alice.get(`/contests/${contestId}/leaderboard`);
  const aliceRow = (lb.body?.data || []).find((p) => p.user?.name === 'Alice Tester');
  ok('leaderboard reflects the accepted submission (score 100)', aliceRow?.score === 100,
     `score=${aliceRow?.score} rows=${JSON.stringify(lb.body?.data||[]).slice(0,240)}`);
  ok('leaderboard does not expose emails', !JSON.stringify(lb.body).includes('@'), 'email present in leaderboard');

  // resubmit must not double-count
  const cs2 = await alice.post(`/contests/${contestId}/submit`, { questionId, code: PY_CORRECT, language: 'PYTHON' });
  await verdictOf(alice, cs2.body?.data?.submissionId);
  await sleep(500);
  const lb2 = await alice.get(`/contests/${contestId}/leaderboard`);
  const aliceRow2 = (lb2.body?.data || []).find((p) => p.user?.name === 'Alice Tester');
  ok('repeat accepted submission does not double-score', aliceRow2?.score === 100, `score=${aliceRow2?.score}`);

  section('PHASE 10 — failure & abuse handling');
  const noCode = await alice.post(`/questions/${questionId}/execute`, { language: 'PYTHON' });
  ok('missing code -> 400 (not 500)', [400,422].includes(noCode.status), `got ${noCode.status}`);
  const objCode = await alice.post(`/questions/${questionId}/execute`, { code: { a: 1 }, language: 'PYTHON' });
  ok('non-string code -> 400', objCode.status === 400, `got ${objCode.status}`);
  const huge = await alice.post(`/questions/${questionId}/execute`, { code: 'x'.repeat(300000), language: 'PYTHON' });
  ok('oversized code -> 413/400 (not 500)', [400, 413].includes(huge.status), `got ${huge.status}`);
  const badLang = await alice.post(`/questions/${questionId}/execute`, { code: 'console.log(1)', language: 'JAVASCRIPT' });
  ok('unsupported language -> 400 with clear message', badLang.status === 400, `got ${badLang.status}`);
  const badQ = await alice.post(`/questions/00000000-0000-0000-0000-000000000000/execute`, { code: PY_CORRECT, language: 'PYTHON' });
  ok('unknown question -> 404', badQ.status === 404, `got ${badQ.status}`);
  const badQGet = await alice.get('/questions/not-a-uuid');
  ok('malformed question id -> 4xx (not 500)', badQGet.status >= 400 && badQGet.status < 500, `got ${badQGet.status}`);
  const badFilter = await alice.get('/questions?difficulty=SUPERHARD');
  ok('invalid filter -> 400', [400,422].includes(badFilter.status), `got ${badFilter.status}`);
  const badRoute = await alice.get('/definitely/not/a/route');
  ok('unknown route -> 404 JSON', badRoute.status === 404, `got ${badRoute.status}`);
  const malformed = await alice.req('POST', '/auth/login', '{"email": ', { rawBody: true });
  ok('malformed JSON -> 400 (no stack trace)', [400,422].includes(malformed.status) && !JSON.stringify(malformed.body).includes('at '),
     `got ${malformed.status} ${JSON.stringify(malformed.body).slice(0,200)}`);
  const emptyCode = await alice.post(`/questions/${questionId}/execute`, { code: '', language: 'PYTHON', mode: 'submit' });
  if (emptyCode.status === 200) {
    const v = await verdictOf(alice, emptyCode.body.data.submissionId);
    ok('empty submission reaches a terminal verdict', TERMINAL.has(v.status), `got ${v.status}`);
  } else {
    ok('empty submission rejected cleanly', [400, 413].includes(emptyCode.status), `got ${emptyCode.status}`);
  }

  section('PHASE 5 — contest expiry (server-side)');
  note('waiting for the contest window to close...');
  const waitUntil = now + 92 * 1000;
  while (Date.now() < waitUntil) await sleep(2000);
  const afterEnd = await alice.post(`/contests/${contestId}/submit`, { questionId, code: PY_CORRECT, language: 'PYTHON' });
  ok('contest submit rejected after expiry (403)', afterEnd.status === 403, `got ${afterEnd.status} ${JSON.stringify(afterEnd.body).slice(0,160)}`);

  // *** the bypass probe ***
  const bypass = await alice.post(`/questions/${questionId}/execute`, {
    code: PY_CORRECT, language: 'PYTHON', mode: 'submit', context: 'CONTEST', contestId,
  });
  let bypassScored = false;
  if (bypass.status === 200) {
    await verdictOf(alice, bypass.body.data.submissionId);
    await sleep(600);
    const lb3 = await alice.get(`/contests/${contestId}/leaderboard`);
    const row = (lb3.body?.data || []).find((p) => p.user?.name === 'Alice Tester');
    bypassScored = (row?.score || 0) > 100;
  }
  // The endpoint is allowed to accept the code — it is a legitimate PRACTICE submission. What
  // it must never do is honour the client-supplied contest routing and move the leaderboard of
  // a contest that has closed. Before the fix this injected 100 points; see leakprobe.mjs.
  ok('generic execute endpoint cannot score an ended contest',
     !bypassScored,
     `status=${bypass.status} scoreAfter=${bypassScored ? '>100 (SCORE INJECTED)' : 'unchanged'}`);

  const bypassRow = bypass.status === 200
    ? await alice.get(`/submissions/${bypass.body.data.submissionId}`)
    : null;
  if (bypassRow) {
    ok('a client-supplied contestId is ignored — the row is recorded as PRACTICE',
       bypassRow.body?.data?.context === 'PRACTICE' && !bypassRow.body?.data?.contestId,
       `context=${bypassRow.body?.data?.context} contestId=${bypassRow.body?.data?.contestId}`);
  }

  section('PHASE 8 — password reset, logout, session persistence');
  const fp = await new Actor('fp').post('/auth/forgot-password', { email: bobEmail });
  ok('forgot-password returns 200 (no enumeration)', fp.status === 200, `got ${fp.status}`);
  const fpUnknown = await new Actor('fp2').post('/auth/forgot-password', { email: 'nobody-here@nexthire.test' });
  ok('forgot-password identical for unknown email', fpUnknown.status === fp.status, `got ${fpUnknown.status}`);
  const rt = await resetTokenFor(bobEmail);
  ok('reset token emailed', Boolean(rt), 'no reset link in log');
  if (rt) {
    const NEWPW = 'N3wAud1t!Pass#2026';
    const rp = await new Actor('rp').post('/auth/reset-password', { token: rt, password: NEWPW, confirmPassword: NEWPW });
    ok('password reset succeeds', rp.status === 200, `got ${rp.status} ${JSON.stringify(rp.body).slice(0,200)}`);
    const oldLogin = await new Actor('old').post('/auth/login', { email: bobEmail, password: PW });
    ok('old password no longer works', oldLogin.status === 401, `got ${oldLogin.status}`);
    const bob2 = new Actor('bob2');
    const newLogin = await login(bob2, bobEmail, NEWPW);
    ok('new password works', newLogin.status === 200, `got ${newLogin.status}`);
    const staleToken = await bob.get('/auth/me');
    ok('reset revokes previously issued access tokens', staleToken.status === 401, `got ${staleToken.status}`);
  }

  const lo = await alice.post('/auth/logout', {});
  ok('logout returns 200', lo.status === 200, `got ${lo.status}`);
  const afterLogout = await alice.post('/auth/refresh', {});
  ok('refresh after logout fails', afterLogout.status !== 200, `got ${afterLogout.status}`);

  const alice2 = new Actor('alice2');
  const relogin = await login(alice2, aliceEmail, PW);
  ok('user can log back in after logout', relogin.status === 200, `got ${relogin.status}`);
  const histAgain = await alice2.get(`/questions/${questionId}/submissions`);
  ok('submission history persists across sessions', (histAgain.body?.data || []).length >= 5,
     `got ${(histAgain.body?.data||[]).length}`);

  section('PHASE 9 — admin capability');
  const users = await admin.get('/auth/admin/users');
  ok('admin can list users', users.status === 200, `got ${users.status}`);
  const analytics = await admin.get('/auth/admin/analytics');
  ok('admin can read analytics', analytics.status === 200, `got ${analytics.status}`);
  const adminSeesHidden = await admin.get(`/questions/${questionId}`);
  ok('admin sees hidden test cases', (adminSeesHidden.body?.data?.testCases || []).length === 4,
     `got ${(adminSeesHidden.body?.data?.testCases||[]).length}`);

  // ---- summary ----
  console.log(`\n================ RESULT ================`);
  console.log(`PASS ${pass}   FAIL ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  if (notes.length) {
    console.log('\nNOTES:');
    notes.forEach((n) => console.log(`  - ${n}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS CRASH', e); process.exit(2); });
