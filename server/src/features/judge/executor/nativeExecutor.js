// Native (non-sandboxed) executor — DEV FALLBACK ONLY.
//
// ⚠️  DANGER: this runs untrusted user code directly on the host with only a timeout and
// output cap — NONE of the Docker isolation (no network/memory/pids/fs containment). It
// exists solely so a developer on a machine without Docker can smoke-test the pipeline.
// It is reachable only when JUDGE_UNSAFE_LOCAL=1 (see executor/index.js) and must NEVER be
// enabled in production. It uses the host's installed python3 / g++ / javac+java toolchains.

const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { getLanguageConfig } = require('./languageConfig');
const { VERDICT, determineVerdict } = require('./verdict');

const OUTPUT_CAP_BYTES = 1 * 1024 * 1024;

function runProcess({ argv, cwd, stdin, timeoutMs }) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;

    child.stdout.on('data', (b) => {
      if (stdout.length < OUTPUT_CAP_BYTES) {
        stdout += b.toString('utf8');
        if (stdout.length >= OUTPUT_CAP_BYTES) {
          stdout = stdout.slice(0, OUTPUT_CAP_BYTES);
          outputTruncated = true;
          try { child.kill('SIGKILL'); } catch { /* gone */ }
        }
      }
    });
    child.stderr.on('data', (b) => {
      if (stderr.length < OUTPUT_CAP_BYTES) stderr += b.toString('utf8');
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    }, timeoutMs);

    const finish = (exitCode, signal, rusage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        timedOut,
        oomKilled: false, // not detectable without a cgroup; MLE is Docker-only
        outputTruncated,
        durationMs: Date.now() - start,
        // maxRSS is in KB on Linux; convert to MB (best-effort).
        memoryMb: rusage ? Math.round((rusage.maxRSS / 1024) * 10) / 10 : null
      });
    };

    child.on('error', (err) => {
      stderr += `\n[judge] failed to spawn ${argv[0]}: ${err.message}`;
      finish(-1, null, null);
    });
    child.on('exit', (code, signal) => finish(code, signal, process.resourceUsage?.()));

    if (stdin != null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function executeSubmission(job, testCases) {
  const cfg = getLanguageConfig(job.language);
  if (!cfg) return internalError(`Language "${job.language}" is not supported by the judge yet.`, testCases);

  const timeLimitMs = Number(job.timeLimitMs) || 2000;
  const cases = Array.isArray(testCases) ? testCases : [];
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nhjudge-native-'));

  try {
    await fs.writeFile(path.join(workDir, cfg.sourceFile), job.code ?? '', 'utf8');

    const compileCmd = cfg.compile || cfg.syntaxCheck;
    let compilerOutput = '';
    if (compileCmd) {
      const compile = await runProcess({ argv: compileCmd, cwd: workDir, stdin: '', timeoutMs: 15000 });
      compilerOutput = (compile.stderr || compile.stdout || '').trim();
      if (compile.exitCode !== 0) {
        return {
          status: VERDICT.COMPILATION_ERROR,
          compilerOutput: compilerOutput || 'Compilation failed.',
          runtimeOutput: '', stderr: compile.stderr, exitCode: compile.exitCode,
          executionTime: compile.durationMs, memoryUsed: null,
          passedTests: 0, totalTests: cases.length, testResults: []
        };
      }
    }

    const testResults = [];
    let passed = 0, maxTime = 0, maxMem = null, overall = VERDICT.ACCEPTED;
    let firstRuntimeOutput = '', failingStderr = '';

    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      const run = await runProcess({ argv: cfg.run, cwd: workDir, stdin: tc.input ?? '', timeoutMs: timeLimitMs });
      const verdict = determineVerdict(run, tc.expectedOutput ?? '');
      maxTime = Math.max(maxTime, run.durationMs);
      if (run.memoryMb != null) maxMem = Math.max(maxMem || 0, run.memoryMb);
      if (i === 0) firstRuntimeOutput = run.stdout;

      testResults.push({
        index: i, isSample: Boolean(tc.isSample), verdict,
        executionTime: run.durationMs, memoryUsed: run.memoryMb, exitCode: run.exitCode,
        stdout: run.stdout, stderr: run.stderr, expectedOutput: tc.expectedOutput ?? ''
      });

      if (verdict === VERDICT.ACCEPTED) { passed++; }
      else { overall = verdict; failingStderr = run.stderr; break; }
    }

    return {
      status: overall, compilerOutput, runtimeOutput: firstRuntimeOutput, stderr: failingStderr,
      exitCode: overall === VERDICT.ACCEPTED ? 0 : null,
      executionTime: maxTime, memoryUsed: maxMem,
      passedTests: passed, totalTests: cases.length, testResults
    };
  } catch (err) {
    return internalError(err.message, cases);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function internalError(message, cases) {
  return {
    status: VERDICT.INTERNAL_ERROR, compilerOutput: '', runtimeOutput: '',
    stderr: `[judge] ${message}`, exitCode: null, executionTime: 0, memoryUsed: null,
    passedTests: 0, totalTests: Array.isArray(cases) ? cases.length : 0, testResults: []
  };
}

module.exports = { executeSubmission };
