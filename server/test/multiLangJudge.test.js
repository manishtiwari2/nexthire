const assert = require('assert');
const { runCodeInSandbox } = require('../src/features/judge/executionEngine');

async function testMultiLangExecution() {
  // Test 1: Python Sandbox
  const pyResult = await runCodeInSandbox('def solution(): pass', 'PYTHON', [{ input: '1', expectedOutput: '1' }]);
  assert.strictEqual(pyResult.status, 'ACCEPTED', 'Python sandbox should return ACCEPTED');

  // Test 2: JavaScript Sandbox
  const jsResult = await runCodeInSandbox('function solution(a, b) { return a + b; }', 'JAVASCRIPT', [{ input: '1, 2', expectedOutput: '3' }]);
  assert.strictEqual(jsResult.status, 'ACCEPTED', 'JavaScript sandbox should return ACCEPTED');

  // Test 3: C++ Sandbox
  const cppResult = await runCodeInSandbox('#include <iostream>\nint main() { return 0; }', 'CPP', [{ input: '', expectedOutput: '' }]);
  assert.strictEqual(cppResult.status, 'ACCEPTED', 'C++ sandbox should return ACCEPTED');

  // Test 4: Java Sandbox
  const javaResult = await runCodeInSandbox('public class Main { public static void main(String[] args) {} }', 'JAVA', [{ input: '', expectedOutput: '' }]);
  assert.strictEqual(javaResult.status, 'ACCEPTED', 'Java sandbox should return ACCEPTED');

  console.log('✓ Multi-Language Judge Worker Unit Tests PASSED (4/4)');
}

testMultiLangExecution().catch((err) => {
  console.error('Multi-lang test failed:', err);
  process.exit(1);
});
