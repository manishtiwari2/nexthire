// Self-check for the solvable problem set.
//
//   node scripts/verifySolvable.js
//
// Runs each problem's known-correct reference solution against every one of its own test cases
// and reports any mismatch. A typo in an expected output would otherwise reach a user as a
// phantom WRONG_ANSWER on a correct solution — the single worst failure mode a judge has,
// because the user has no way to tell it from their own bug.
//
// This is also run by `npm run seed`, which refuses to write a problem that does not verify.

const { spawn } = require('child_process');
const { SOLVABLE } = require('../prisma/data/solvable');
const { normalizeOutput } = require('../src/features/judge/executor/verdict');

const PYTHON = process.env.JUDGE_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

function runPython(source, stdin, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ['-c', source], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    }, timeoutMs);

    child.stdout.on('data', (b) => { out += b.toString('utf8'); });
    child.stderr.on('data', (b) => { err += b.toString('utf8'); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ out: '', err: `spawn failed: ${e.message}`, code: -1, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ out, err, code, timedOut });
    });

    child.stdin.write(stdin ?? '');
    child.stdin.end();
  });
}

async function verify() {
  let failures = 0;
  let checked = 0;

  for (const problem of SOLVABLE) {
    const samples = problem.tests.filter((t) => t.isSample).length;
    const issues = [];

    if (samples === 0) issues.push('has no sample test case — the Run button would have nothing to execute');
    if (problem.tests.length === samples) issues.push('has no hidden test cases — Submit would be identical to Run');

    for (let i = 0; i < problem.tests.length; i++) {
      const t = problem.tests[i];
      const { out, err, code, timedOut } = await runPython(problem.reference, t.input);
      checked++;

      if (timedOut) {
        issues.push(`test ${i}: the reference solution timed out`);
        continue;
      }
      if (code !== 0) {
        issues.push(`test ${i}: the reference solution crashed (exit ${code}) ${err.trim().split('\n').pop()}`);
        continue;
      }
      const actual = normalizeOutput(out);
      const expected = normalizeOutput(t.expectedOutput);
      if (actual !== expected) {
        issues.push(
          `test ${i} (input ${JSON.stringify(t.input).slice(0, 40)}): expected ${JSON.stringify(expected).slice(0, 60)} ` +
          `but the reference produced ${JSON.stringify(actual).slice(0, 60)}`
        );
      }
    }

    if (issues.length) {
      failures += issues.length;
      console.error(`  ✗ ${problem.slug}`);
      issues.forEach((m) => console.error(`      ${m}`));
    } else {
      console.log(`  ✓ ${problem.slug}  (${samples} sample + ${problem.tests.length - samples} hidden)`);
    }
  }

  console.log(`\n${SOLVABLE.length} problems, ${checked} test cases checked, ${failures} problem(s) found.`);
  return failures === 0;
}

module.exports = { verify, runPython };

if (require.main === module) {
  verify()
    .then((okResult) => process.exit(okResult ? 0 : 1))
    .catch((err) => {
      console.error('verification crashed:', err);
      process.exit(2);
    });
}
