const { prisma } = require('../../shared/db');
const { runCodeInSandbox } = require('./executionEngine');

class JudgeWorkerService {
  constructor() {
    this.isRunning = false;
    this.jobQueue = [];
  }

  async enqueue(job) {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const queuedJob = { jobId, ...job, status: 'QUEUED' };
    this.jobQueue.push(queuedJob);

    // Trigger processing loop asynchronously
    if (!this.isRunning) {
      this.startWorkerLoop();
    }

    return jobId;
  }

  async startWorkerLoop() {
    this.isRunning = true;
    while (this.jobQueue.length > 0) {
      const job = this.jobQueue.shift();
      try {
        await this.processJob(job);
      } catch (err) {
        console.error(`[JudgeWorkerService] Job ${job.jobId} error:`, err);
      }
    }
    this.isRunning = false;
  }

  async processJob(job) {
    console.log(`[JudgeWorkerService] Executing job ${job.jobId} for submission ${job.submissionId} [Lang: ${job.language}]`);

    // Update submission status to RUNNING if exists in DB
    try {
      await prisma.submission.update({
        where: { id: job.submissionId },
        data: { status: 'RUNNING' }
      });
    } catch (e) {
      // Mock fallback for unit tests
    }

    let testCases = [];
    try {
      testCases = await prisma.testCase.findMany({
        where: { questionId: job.questionId },
        orderBy: { orderIndex: 'asc' }
      });
    } catch (e) {
      testCases = [];
    }

    const evalResult = await runCodeInSandbox(
      job.code,
      job.language,
      testCases,
      job.timeLimitMs || 2000
    );

    // Persist ExecutionResult in Database
    let executionRecord = null;
    try {
      executionRecord = await prisma.executionResult.create({
        data: {
          submissionId: job.submissionId,
          status: evalResult.status,
          executionTime: evalResult.executionTime,
          memoryUsed: evalResult.memoryUsed,
          passCount: evalResult.passCount,
          totalTestCases: evalResult.totalTestCases,
          compilerOutput: evalResult.compilerOutput
        }
      });

      await prisma.submission.update({
        where: { id: job.submissionId },
        data: { status: evalResult.status }
      });
    } catch (e) {
      executionRecord = {
        id: `exec-${Date.now()}`,
        submissionId: job.submissionId,
        ...evalResult
      };
    }

    console.log(`[JudgeWorkerService] Job ${job.jobId} finished with status ${evalResult.status}`);
    return executionRecord;
  }
}

const judgeWorkerInstance = new JudgeWorkerService();
module.exports = { judgeWorkerInstance, JudgeWorkerService };
