const { judgeWorkerInstance } = require('./judgeWorkerService');

class InMemoryJudgeQueue {
  async enqueueJob(job) {
    return await judgeWorkerInstance.enqueue(job);
  }

  async getJobStatus(jobId) {
    return 'COMPLETED';
  }
}

const judgeQueueInstance = new InMemoryJudgeQueue();
module.exports = { judgeQueueInstance, InMemoryJudgeQueue };
