// Docker sandbox executor.
//
// Compiles (if needed) and runs untrusted user code inside throwaway Docker containers,
// one container per phase / per test case. The Express API never reaches this code — only
// the judge worker process does.
//
// SECURITY MODEL (see docs/JUDGE_SYSTEM.md for the full table). Every `docker run` uses:
//   --network none .......... no network access (exfiltration / SSRF / DDoS impossible)
//   --memory / --memory-swap  hard memory cap, no swap  -> OOM kill => MEMORY_LIMIT_EXCEEDED
//   --cpus .................. CPU quota (resource fairness)
//   --pids-limit ............ caps process/thread count  -> fork bombs cannot exhaust host
//   --read-only ............. immutable root filesystem  -> cannot write outside the mount
//   --tmpfs /tmp ............ small writable scratch, capped, wiped on exit
//   --user 1000:1000 ........ non-root, unprivileged
//   --cap-drop ALL .......... drops every Linux capability
//   --security-opt no-new-privileges .. no privilege escalation (setuid, etc.)
//   --ulimit fsize .......... caps bytes written to disk  -> disk-fill / output bombs
//   --ulimit nofile ......... caps open file descriptors
//   wall-clock timer + docker kill .... hard timeout      -> infinite loops => TLE
//   stdout byte cap ......... bounded capture             -> output floods => OLE
//   --rm .................... container auto-removed (no leaked state)
// Commands are passed as argv (no shell), and the workdir is bind-mounted read-only for the
// run phase so a program cannot tamper with the compiled artifact or another test.

const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { getLanguageConfig } = require('./languageConfig');
const { VERDICT, determineVerdict } = require('./verdict');

const OUTPUT_CAP_BYTES = 1 * 1024 * 1024; // 1 MiB per stream -> OUTPUT_LIMIT_EXCEEDED
const FSIZE_LIMIT_BYTES = 32 * 1024 * 1024; // ulimit fsize (bytes a process may write)
const KILL_GRACE_MS = 2000; // extra time after the limit before we give up killing
const DEFAULT_CPUS = process.env.JUDGE_CPUS || '1';
const DOCKER_BIN = process.env.JUDGE_DOCKER_BIN || 'docker';

/**
 * Run one container to completion, feeding `stdin` and capturing bounded stdout/stderr.
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number, timedOut:boolean,
 *                     oomKilled:boolean, outputTruncated:boolean, durationMs:number}>}
 */
function runContainer({ image, argv, hostDir, readOnly, stdin, timeoutMs, memoryMb }) {
  return new Promise((resolve) => {
    const name = `nhjudge_${crypto.randomBytes(8).toString('hex')}`;
    const mem = `${memoryMb}m`;
    const dockerArgs = [
      'run', '--rm', '-i',
      '--name', name,
      '--network', 'none',
      '--memory', mem,
      '--memory-swap', mem,
      '--cpus', String(DEFAULT_CPUS),
      '--pids-limit', '128',
      '--read-only',
      '--tmpfs', '/tmp:rw,exec,size=64m',
      '--user', '1000:1000',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--ulimit', `fsize=${FSIZE_LIMIT_BYTES}`,
      '--ulimit', 'nofile=256',
      '-w', '/judge',
      '-v', `${hostDir}:/judge:${readOnly ? 'ro' : 'rw'}`,
      image,
      ...argv
    ];

    const start = Date.now();
    const child = spawn(DOCKER_BIN, dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;

    const capture = (buf, which) => {
      if (which === 'out') {
        if (stdout.length < OUTPUT_CAP_BYTES) {
          stdout += buf.toString('utf8');
          if (stdout.length >= OUTPUT_CAP_BYTES) {
            stdout = stdout.slice(0, OUTPUT_CAP_BYTES);
            outputTruncated = true;
            hardKill(); // stop a runaway producer immediately
          }
        }
      } else {
        if (stderr.length < OUTPUT_CAP_BYTES) {
          stderr += buf.toString('utf8');
          if (stderr.length >= OUTPUT_CAP_BYTES) stderr = stderr.slice(0, OUTPUT_CAP_BYTES);
        }
      }
    };

    child.stdout.on('data', (b) => capture(b, 'out'));
    child.stderr.on('data', (b) => capture(b, 'err'));

    const hardKill = () => {
      // `docker kill` reaches the containerized process; killing the CLI child alone would not.
      spawn(DOCKER_BIN, ['kill', name], { stdio: 'ignore' }).on('error', () => {});
    };

    const timer = setTimeout(() => {
      timedOut = true;
      hardKill();
    }, timeoutMs);

    // Safety net: if docker kill somehow doesn't return the process, force-close after grace.
    const graceTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs + KILL_GRACE_MS);

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      // exit 137 = SIGKILL: either our timeout (timedOut) or the kernel OOM killer.
      const oomKilled = !timedOut && (exitCode === 137 || signal === 'SIGKILL');
      resolve({
        stdout,
        stderr,
        exitCode: typeof exitCode === 'number' ? exitCode : 137,
        timedOut,
        oomKilled,
        outputTruncated,
        durationMs: Date.now() - start
      });
    };

    child.on('error', (err) => {
      stderr += `\n[judge] failed to start docker: ${err.message}`;
      finish(-1, null);
    });
    child.on('close', (code, signal) => finish(code, signal));

    if (stdin != null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

/**
 * Compile (if needed) and run every test case for a submission inside Docker.
 * @param {{code:string, language:string, timeLimitMs?:number, memoryLimitMb?:number}} job
 * @param {Array<{input:string, expectedOutput:string, isSample?:boolean}>} testCases
 * @returns {Promise<object>} aggregate execution result
 */
async function executeSubmission(job, testCases) {
  const cfg = getLanguageConfig(job.language);
  if (!cfg) {
    return internalError(`Language "${job.language}" is not supported by the judge yet.`, testCases);
  }

  const timeLimitMs = Number(job.timeLimitMs) || 2000;
  const memoryLimitMb = Number(job.memoryLimitMb) || 256;
  const cases = Array.isArray(testCases) ? testCases : [];

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nhjudge-'));
  try {
    await fs.writeFile(path.join(workDir, cfg.sourceFile), job.code ?? '', 'utf8');

    // ---- Compile / syntax-check phase ----
    const compileCmd = cfg.compile || cfg.syntaxCheck;
    let compilerOutput = '';
    if (compileCmd) {
      const compile = await runContainer({
        image: cfg.image,
        argv: compileCmd,
        hostDir: workDir,
        readOnly: false, // compiler writes artifacts into the workdir
        stdin: '',
        timeoutMs: Math.max(timeLimitMs, 10000), // compilers can be slow; allow >= 10s
        memoryMb: Math.max(memoryLimitMb, 512)
      });
      compilerOutput = (compile.stderr || compile.stdout || '').trim();
      if (compile.exitCode !== 0) {
        return {
          status: VERDICT.COMPILATION_ERROR,
          compilerOutput: compilerOutput || 'Compilation failed.',
          runtimeOutput: '',
          stderr: compile.stderr,
          exitCode: compile.exitCode,
          executionTime: compile.durationMs,
          memoryUsed: null,
          passedTests: 0,
          totalTests: cases.length,
          testResults: []
        };
      }
    }

    // ---- Execution phase: run each test, stop at first failure ----
    const testResults = [];
    let passed = 0;
    let maxTime = 0;
    let maxMem = null;
    let overall = VERDICT.ACCEPTED;
    let firstRuntimeOutput = '';
    let failingStderr = '';

    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      const run = await runContainer({
        image: cfg.image,
        argv: cfg.run,
        hostDir: workDir,
        readOnly: true, // run phase cannot modify the compiled artifact or other cases
        stdin: tc.input ?? '',
        timeoutMs: timeLimitMs,
        memoryMb: memoryLimitMb
      });

      const verdict = determineVerdict(run, tc.expectedOutput ?? '');
      const memUsed = run.oomKilled ? memoryLimitMb : null;
      maxTime = Math.max(maxTime, run.durationMs);
      if (memUsed != null) maxMem = Math.max(maxMem || 0, memUsed);
      if (i === 0) firstRuntimeOutput = run.stdout;

      testResults.push({
        index: i,
        isSample: Boolean(tc.isSample),
        verdict,
        executionTime: run.durationMs,
        memoryUsed: memUsed,
        exitCode: run.exitCode,
        stdout: run.stdout,
        stderr: run.stderr,
        expectedOutput: tc.expectedOutput ?? ''
      });

      if (verdict === VERDICT.ACCEPTED) {
        passed++;
      } else {
        overall = verdict;
        failingStderr = run.stderr;
        break; // classic stop-on-first-failure; remaining cases are not run
      }
    }

    return {
      status: overall,
      compilerOutput,
      runtimeOutput: firstRuntimeOutput,
      stderr: failingStderr,
      exitCode: overall === VERDICT.ACCEPTED ? 0 : null,
      executionTime: maxTime,
      memoryUsed: maxMem,
      passedTests: passed,
      totalTests: cases.length,
      testResults
    };
  } catch (err) {
    return internalError(err.message, cases);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function internalError(message, cases) {
  return {
    status: VERDICT.INTERNAL_ERROR,
    compilerOutput: '',
    runtimeOutput: '',
    stderr: `[judge] ${message}`,
    exitCode: null,
    executionTime: 0,
    memoryUsed: null,
    passedTests: 0,
    totalTests: Array.isArray(cases) ? cases.length : 0,
    testResults: []
  };
}

module.exports = { executeSubmission, runContainer };
