// Per-language compile/run configuration for the sandbox.
//
// Commands are expressed as argv arrays (never shell strings) so user-controlled
// values can never be interpreted by a shell — one of the sandbox's shell-escape
// mitigations. The judge initially supports Python, C++ and Java (per the milestone);
// other Language enum values resolve to `null` and are reported as INTERNAL_ERROR.

/** @typedef {{ image:string, sourceFile:string, compile:string[]|null,
 *              syntaxCheck:string[]|null, run:string[] }} LanguageConfig */

const CONFIGS = {
  PYTHON: {
    image: () => process.env.JUDGE_IMAGE_PYTHON || 'python:3.10-slim',
    sourceFile: 'main.py',
    compile: null,
    // Surfaces syntax errors as COMPILATION_ERROR before we bother running test cases.
    syntaxCheck: ['python3', '-m', 'py_compile', 'main.py'],
    run: ['python3', 'main.py']
  },
  CPP: {
    image: () => process.env.JUDGE_IMAGE_CPP || 'gcc:13',
    sourceFile: 'main.cpp',
    compile: ['g++', '-O2', '-std=c++20', 'main.cpp', '-o', 'main'],
    syntaxCheck: null,
    run: ['./main']
  },
  JAVA: {
    image: () => process.env.JUDGE_IMAGE_JAVA || 'eclipse-temurin:17-jdk',
    sourceFile: 'Main.java',
    compile: ['javac', 'Main.java'],
    syntaxCheck: null,
    run: ['java', '-cp', '.', 'Main']
  }
};

/** Languages the judge can currently execute. */
const SUPPORTED_LANGUAGES = Object.keys(CONFIGS);

/**
 * Resolve the config for a language (case-insensitive). Returns a fully-resolved object
 * (image string evaluated) or `null` if the language is not supported.
 * @param {string} language
 * @returns {LanguageConfig|null}
 */
function getLanguageConfig(language) {
  const key = String(language || '').toUpperCase();
  const cfg = CONFIGS[key];
  if (!cfg) return null;
  return {
    image: cfg.image(),
    sourceFile: cfg.sourceFile,
    compile: cfg.compile,
    syntaxCheck: cfg.syntaxCheck,
    run: cfg.run
  };
}

function isLanguageSupported(language) {
  return Boolean(CONFIGS[String(language || '').toUpperCase()]);
}

module.exports = { getLanguageConfig, isLanguageSupported, SUPPORTED_LANGUAGES };
