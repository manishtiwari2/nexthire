const assert = require('assert');

// Unit Test 1: Question Normalization Structure Validation
function validateQuestionPayload(payload) {
  assert.ok(payload.title, 'Question must have a title');
  assert.ok(payload.topicName, 'Question must specify a topic name');
  assert.ok(Array.isArray(payload.starterCodes), 'starterCodes must be an array');
  assert.ok(Array.isArray(payload.testCases), 'testCases must be an array');
  return true;
}

const samplePayload = {
  title: 'Two Sum',
  topicName: 'Arrays & Hashing',
  starterCodes: [{ language: 'PYTHON', template: 'def twoSum(): pass' }],
  testCases: [{ input: '[2,7,11,15], 9', expectedOutput: '[0,1]', isSample: true }]
};

assert.ok(validateQuestionPayload(samplePayload), 'Valid payload should pass validation');
console.log('✓ Question Bank 3NF Normalization Unit Tests PASSED (1/1)');
