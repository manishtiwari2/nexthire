// Judge queue — BullMQ producer.
//
// This is the seam the Express API uses to hand a submission off for evaluation. It
// implements the `IJudgeQueue` contract described in ADR-0003 (enqueueJob/getJobStatus/
// cancelJob). The API process NEVER executes user code — it only enqueues jobs here; a
// separate worker process (judgeWorker.js) consumes them and runs the Docker sandbox.
//
// The BullMQ Queue and its Redis connection are created lazily on first use, so importing
// a controller that requires this module (as unit tests do) does not open a Redis socket.

const { JUDGE_QUEUE_NAME, createRedisConnection } = require('./queueConfig');

class JudgeQueue {
  constructor() {
    this._queue = null;
    this._connection = null;
  }

  /** Lazily construct the BullMQ Queue (and its Redis connection). */
  _getQueue() {
    if (this._queue) return this._queue;
    const { Queue } = require('bullmq');
    this._connection = createRedisConnection();
    this._queue = new Queue(JUDGE_QUEUE_NAME, {
      connection: this._connection,
      defaultJobOptions: {
        attempts: 1, // untrusted code — never silently retry a failed run
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 }
      }
    });
    return this._queue;
  }

  /**
   * Enqueue a submission for judging.
   * @param {{submissionId:string, questionId:string, code:string, language:string,
   *          timeLimitMs?:number, memoryLimitMb?:number}} job
   * @returns {Promise<string>} the BullMQ job id
   */
  async enqueueJob(job) {
    if (!job || !job.submissionId) {
      throw new Error('enqueueJob requires a submissionId');
    }
    const queue = this._getQueue();
    // Use the submissionId as the job id so a rejudge/cancel can target it deterministically
    // and duplicate enqueues of the same submission collapse to one job.
    const added = await queue.add('judge', job, { jobId: job.submissionId });
    return added.id;
  }

  /**
   * @param {string} jobId
   * @returns {Promise<string|null>} BullMQ state (waiting|active|completed|failed|...) or null
   */
  async getJobStatus(jobId) {
    const queue = this._getQueue();
    const job = await queue.getJob(jobId);
    if (!job) return null;
    return job.getState();
  }

  /**
   * Cancel a job that has not started running yet (waiting/delayed). Returns true if a
   * pending job was removed, false if it was missing or already active/finished.
   * @param {string} jobId
   * @returns {Promise<boolean>}
   */
  async cancelJob(jobId) {
    const queue = this._getQueue();
    const job = await queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'waiting-children') {
      await job.remove();
      return true;
    }
    return false;
  }

  /** Close the queue + connection (graceful shutdown / tests). */
  async close() {
    if (this._queue) await this._queue.close();
    if (this._connection) await this._connection.quit();
    this._queue = null;
    this._connection = null;
  }
}

const judgeQueueInstance = new JudgeQueue();

module.exports = { judgeQueueInstance, JudgeQueue };
