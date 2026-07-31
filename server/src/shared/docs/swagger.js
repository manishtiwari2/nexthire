const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'NextHire Production REST API',
    version: '1.0.0',
    description: 'NextHire Enterprise Developer Platform REST API (v1)'
  },
  servers: [
    { url: 'http://localhost:5000/api/v1', description: 'Development Server (v1)' }
  ],
  paths: {
    '/auth/google': {
      post: {
        summary: 'Google OAuth / Authentication',
        responses: { 200: { description: 'Returns JWT Access Token' } }
      }
    },
    '/questions': {
      get: {
        summary: 'List questions with search & difficulty filters',
        responses: { 200: { description: 'Array of 3NF questions' } }
      }
    },
    '/contests': {
      get: {
        summary: 'List speed contests',
        responses: { 200: { description: 'Array of contests' } }
      }
    },
    '/questions/{id}/execute': {
      post: {
        summary: 'Create a submission (Run/Submit) — enqueues it on the judge queue',
        description: 'Persists a Submission (status PENDING) and pushes a job to the BullMQ judge queue. Never executes code inline. Returns immediately; the verdict arrives via Socket.IO (submission:update) or by polling the result endpoint.',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Question id' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['PYTHON', 'CPP', 'JAVA'] } }, required: ['code', 'language'] } } }
        },
        responses: {
          200: { description: '{ submissionId, jobId, status: "QUEUED" }' },
          404: { description: 'Question not found' }
        }
      }
    },
    '/submissions': {
      get: {
        summary: 'List submission history for the authenticated user',
        description: 'Filter by questionId/contestId. Admins may pass userId to view another user\'s history. Hidden test-case I/O is never included.',
        parameters: [
          { name: 'questionId', in: 'query', required: false },
          { name: 'contestId', in: 'query', required: false },
          { name: 'limit', in: 'query', required: false }
        ],
        responses: { 200: { description: 'Array of submission DTOs (each with its latest execution summary)' } }
      }
    },
    '/submissions/{id}': {
      get: {
        summary: 'Get a submission with its latest execution result',
        description: 'IDOR-guarded: a user may only read their own submissions; admins may read any. Non-admins never receive hidden (non-sample) test-case detail.',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { 200: { description: 'Submission DTO' }, 403: { description: 'Not authorized' }, 404: { description: 'Not found' } }
      }
    },
    '/submissions/{id}/result': {
      get: {
        summary: 'Get the latest ExecutionResult DTO for a submission',
        description: 'Returns { status, pending: true } while the judge is still working. Sample test-case detail only for non-admins.',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { 200: { description: 'ExecutionResult DTO or pending marker' }, 403: { description: 'Not authorized' } }
      }
    },
    '/submissions/{id}/rejudge': {
      post: {
        summary: 'Re-enqueue a submission for judging (ADMIN only)',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { 200: { description: '{ submissionId, jobId, status: "QUEUED" }' }, 403: { description: 'Requires ADMIN' } }
      }
    },
    '/submissions/{id}/cancel': {
      post: {
        summary: 'Cancel a still-pending submission',
        description: 'Removes the job from the queue if it has not started and marks the submission CANCELLED. Owner or admin only; 409 if already running/finished.',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { 200: { description: 'Cancelled' }, 403: { description: 'Not authorized' }, 409: { description: 'Not cancellable in current status' } }
      }
    },
    '/interviews': {
      get: {
        summary: 'List scheduled mock interviews',
        responses: { 200: { description: 'Array of interview sessions' } }
      }
    },
    '/dashboard/stats': {
      get: {
        summary: 'Get derived analytics for user',
        responses: { 200: { description: 'Calculated user stats' } }
      }
    }
  }
};

function serveDocs(req, res) {
  res.json(openApiSpec);
}

module.exports = { openApiSpec, serveDocs };
