// Judge dispatch seam.
//
// The API hands a submission off for evaluation through this single function. There are two
// modes, chosen by the JUDGE_INLINE env flag:
//
//   • Queue mode (default): enqueue onto the BullMQ/Redis queue. A separate worker process
//     (judgeWorker.js) consumes it and runs the Docker sandbox. This is the production path.
//
//   • Inline mode (JUDGE_INLINE=1): evaluate the submission in-process, synchronously, using
//     the SAME judgeProcessor + executor the worker uses. Intended for local development on a
//     machine without Redis/Docker. Pair with JUDGE_UNSAFE_LOCAL=1 so the native executor is
//     used (Docker is not required). No architecture changes — inline mode simply calls the
//     existing processor directly instead of via the queue.
//
// Both modes return a "jobId" string so callers (controllers) are agnostic to the mode.

const { judgeQueueInstance } = require('./judgeQueue');

/** @returns {boolean} true when submissions should be judged in-process. */
function isInlineMode() {
  return process.env.JUDGE_INLINE === '1';
}

// In inline mode we can emit lifecycle events straight to Socket.IO (the API owns the io
// server), so the IDE gets live RUNNING/COMPLETED updates without the Redis relay.
let _io = null;
function setJudgeIo(io) {
  _io = io;
}

function inlinePublish() {
  if (!_io) return null;
  return async (payload) => {
    if (payload && payload.userId) {
      _io.to(`user:${payload.userId}`).emit('submission:update', payload);
    }
  };
}

/**
 * Evaluate a submission — inline or via the queue.
 * @param {{submissionId:string, questionId:string, code:string, language:string,
 *          timeLimitMs?:number, memoryLimitMb?:number}} job
 * @returns {Promise<string>} a job id (the BullMQ id, or the submissionId in inline mode)
 */
async function dispatchJudgeJob(job) {
  if (!job || !job.submissionId) {
    throw new Error('dispatchJudgeJob requires a submissionId');
  }

  if (!isInlineMode()) {
    return judgeQueueInstance.enqueueJob(job);
  }

  // Inline: reuse the exact processor + executor the worker wires in.
  const { prisma } = require('../../shared/db');
  const executor = require('./executor');
  const { processJob } = require('./judgeProcessor');

  await processJob({ prisma, executor, publish: inlinePublish() }, job);
  return job.submissionId;
}

module.exports = { dispatchJudgeJob, isInlineMode, setJudgeIo };
