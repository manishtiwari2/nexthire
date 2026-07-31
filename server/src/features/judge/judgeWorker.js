// Judge worker process.
//
// Run separately from the API: `npm run worker` (or the judge-worker service in
// docker-compose). It consumes the BullMQ queue and evaluates each submission inside the
// Docker sandbox. Run multiple replicas to scale to thousands of submissions.

require('dotenv').config();

const { Worker } = require('bullmq');
const { prisma } = require('../../shared/db');
const { JUDGE_QUEUE_NAME, createRedisConnection } = require('./queueConfig');
const executor = require('./executor');
const { createPublisher } = require('./judgeEvents');
const { processJob } = require('./judgeProcessor');

const concurrency = Math.max(1, parseInt(process.env.JUDGE_CONCURRENCY, 10) || 4);
const publisher = createPublisher();

const worker = new Worker(
  JUDGE_QUEUE_NAME,
  async (job) => {
    console.log(`[judge] processing submission ${job.data.submissionId} [${job.data.language}]`);
    const execution = await processJob(
      { prisma, executor, publish: (p) => publisher.publish(p) },
      job.data
    );
    return { executionId: execution?.id || null, status: execution?.status || null };
  },
  {
    connection: createRedisConnection(),
    concurrency
  }
);

worker.on('completed', (job, ret) => {
  console.log(`[judge] submission ${job.data.submissionId} => ${ret?.status || 'done'}`);
});

worker.on('failed', async (job, err) => {
  console.error(`[judge] submission ${job?.data?.submissionId} failed:`, err.message);
  // Best-effort: mark the submission as INTERNAL_ERROR so it doesn't hang in RUNNING forever.
  if (job?.data?.submissionId) {
    try {
      await prisma.submission.update({
        where: { id: job.data.submissionId },
        data: { status: 'INTERNAL_ERROR' }
      });
    } catch { /* submission may be gone */ }
  }
});

console.log(`🧑‍⚖️  NextHire judge worker started (concurrency=${concurrency}, sandbox=${process.env.JUDGE_UNSAFE_LOCAL === '1' ? 'NATIVE-UNSAFE' : 'docker'})`);

async function shutdown() {
  console.log('[judge] shutting down worker...');
  await worker.close();
  await publisher.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { worker };
