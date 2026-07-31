// Pure verdict logic — no I/O, no Docker, no DB. This is the heart of "every verdict is
// based on actual execution": given the raw signals a container run produced, it decides
// the verdict. Kept side-effect free so it is exhaustively unit-tested.

const VERDICT = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  WRONG_ANSWER: 'WRONG_ANSWER',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  COMPILATION_ERROR: 'COMPILATION_ERROR',
  TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  OUTPUT_LIMIT_EXCEEDED: 'OUTPUT_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});

/**
 * Normalize program output for comparison: unify line endings, strip trailing whitespace
 * on every line, and trim leading/trailing blank lines. This is the standard "ignore
 * trailing whitespace" comparison most judges use — it avoids false WRONG_ANSWERs from a
 * stray newline while still catching genuinely different output.
 * @param {string} s
 * @returns {string}
 */
function normalizeOutput(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .replace(/^\n+/, '');
}

/**
 * Compare expected vs actual output using normalized equality.
 * @returns {boolean} true when outputs match
 */
function compareOutput(expected, actual) {
  return normalizeOutput(expected) === normalizeOutput(actual);
}

/**
 * Decide the verdict for a single test-case run from the raw container signals.
 * Order matters: resource-limit signals are checked before correctness because a program
 * that was killed for TLE/MLE has, by definition, no trustworthy output.
 *
 * @param {object} run
 * @param {boolean} run.timedOut        our wall-clock timer fired and we killed the container
 * @param {boolean} run.oomKilled       the container was OOM-killed (memory limit)
 * @param {boolean} run.outputTruncated stdout exceeded the output cap
 * @param {number}  run.exitCode        process exit code (non-zero => runtime error)
 * @param {string}  run.stdout          captured stdout
 * @param {string}  expectedOutput
 * @returns {string} a VERDICT value
 */
function determineVerdict(run, expectedOutput) {
  if (run.timedOut) return VERDICT.TIME_LIMIT_EXCEEDED;
  if (run.oomKilled) return VERDICT.MEMORY_LIMIT_EXCEEDED;
  if (run.outputTruncated) return VERDICT.OUTPUT_LIMIT_EXCEEDED;
  if (run.exitCode !== 0) return VERDICT.RUNTIME_ERROR;
  return compareOutput(expectedOutput, run.stdout) ? VERDICT.ACCEPTED : VERDICT.WRONG_ANSWER;
}

module.exports = { VERDICT, normalizeOutput, compareOutput, determineVerdict };
