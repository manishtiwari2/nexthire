const { test } = require('node:test');
const assert = require('node:assert');
const { getLanguageConfig, isLanguageSupported, SUPPORTED_LANGUAGES } = require('../src/features/judge/executor/languageConfig');

test('supports Python, C++ and Java', () => {
  assert.deepStrictEqual([...SUPPORTED_LANGUAGES].sort(), ['CPP', 'JAVA', 'PYTHON']);
  assert.ok(isLanguageSupported('python'));
  assert.ok(isLanguageSupported('CPP'));
  assert.ok(isLanguageSupported('Java'));
});

test('unsupported languages resolve to null', () => {
  assert.strictEqual(getLanguageConfig('GO'), null);
  assert.strictEqual(getLanguageConfig('brainfuck'), null);
  assert.ok(!isLanguageSupported('GO'));
});

test('Python config is interpreted with a syntax pre-check', () => {
  const cfg = getLanguageConfig('python');
  assert.strictEqual(cfg.sourceFile, 'main.py');
  assert.strictEqual(cfg.compile, null);
  assert.deepStrictEqual(cfg.syntaxCheck, ['python3', '-m', 'py_compile', 'main.py']);
  assert.deepStrictEqual(cfg.run, ['python3', 'main.py']);
});

test('C++ config compiles then runs a binary', () => {
  const cfg = getLanguageConfig('cpp');
  assert.strictEqual(cfg.sourceFile, 'main.cpp');
  assert.ok(cfg.compile.includes('g++'));
  assert.ok(cfg.compile.includes('-std=c++20'));
  assert.deepStrictEqual(cfg.run, ['./main']);
});

test('Java config compiles Main.java then runs Main', () => {
  const cfg = getLanguageConfig('java');
  assert.strictEqual(cfg.sourceFile, 'Main.java');
  assert.deepStrictEqual(cfg.compile, ['javac', 'Main.java']);
  assert.deepStrictEqual(cfg.run, ['java', '-cp', '.', 'Main']);
});

test('commands are argv arrays (no shell string) — shell-escape mitigation', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const cfg = getLanguageConfig(lang);
    assert.ok(Array.isArray(cfg.run));
    if (cfg.compile) assert.ok(Array.isArray(cfg.compile));
  }
});

test('image is overridable via env', () => {
  const prev = process.env.JUDGE_IMAGE_PYTHON;
  process.env.JUDGE_IMAGE_PYTHON = 'my-python:custom';
  assert.strictEqual(getLanguageConfig('python').image, 'my-python:custom');
  if (prev === undefined) delete process.env.JUDGE_IMAGE_PYTHON;
  else process.env.JUDGE_IMAGE_PYTHON = prev;
});
