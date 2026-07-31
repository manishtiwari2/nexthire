// Executor factory. Selects the sandbox implementation and exposes a single
// `executeSubmission(job, testCases)` entry point used by the judge worker.
//
// Default: the Docker sandbox (secure). Only when JUDGE_UNSAFE_LOCAL=1 does it fall back to
// the unsafe native executor — a loud, opt-in dev convenience for machines without Docker.

const dockerExecutor = require('./dockerExecutor');
const nativeExecutor = require('./nativeExecutor');

function isUnsafeLocalEnabled() {
  return process.env.JUDGE_UNSAFE_LOCAL === '1';
}

/** @returns {{executeSubmission: Function}} the active executor */
function getExecutor() {
  if (isUnsafeLocalEnabled()) {
    if (!global.__NH_JUDGE_UNSAFE_WARNED) {
      global.__NH_JUDGE_UNSAFE_WARNED = true;
      console.warn(
        '⚠️  [judge] JUDGE_UNSAFE_LOCAL=1 — executing untrusted code WITHOUT a Docker sandbox. ' +
        'Dev only. Never enable this in production.'
      );
    }
    return nativeExecutor;
  }
  return dockerExecutor;
}

function executeSubmission(job, testCases) {
  return getExecutor().executeSubmission(job, testCases);
}

module.exports = { executeSubmission, getExecutor };
