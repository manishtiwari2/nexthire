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
