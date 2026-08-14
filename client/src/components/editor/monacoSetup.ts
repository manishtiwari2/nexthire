/**
 * Self-hosted Monaco, trimmed to the languages the judge actually runs.
 *
 * Two things happen here, both before any <Editor> mounts:
 *
 * 1. Monaco is served from our own bundle instead of cdn.jsdelivr.net.
 *    `@monaco-editor/react` defaults to fetching ~12 files from that CDN at runtime, which
 *    makes the editor — the core of the product — dead whenever the CDN is blocked
 *    (corporate proxies, some ISPs) or down, puts third-party script execution on the
 *    critical path, and rules out a strict script-src CSP.
 *
 * 2. Only Python, C++ and Java are pulled in. Importing the `monaco-editor` barrel would
 *    bundle all ~80 basic languages plus the TypeScript/JSON/CSS/HTML language services —
 *    about 3.9 MB — none of which the judge can execute. Importing `editor.api` and three
 *    language contributions keeps the payload proportional to the feature.
 *
 * Import this module for its side effects before rendering the editor.
 */
// The deep ESM entry is typed via src/types/monaco-esm.d.ts — see the note there on why
// the package's own exports map does not surface these types.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type * as MonacoNS from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// Syntax highlighting for the three supported languages (tokenizers only — these are
// Monarch grammars, not language servers, which is all a submit-and-judge editor needs).
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';

// Core editor features: find/replace, bracket matching, folding, comments, multi-cursor,
// word-based suggestions, indentation. Pulled individually because editor.api ships bare.
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo';

// Vite compiles this to a real worker, keeping tokenization off the main thread. Without a
// MonacoEnvironment Monaco warns and degrades to synchronous fallbacks.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

(self as unknown as { MonacoEnvironment: MonacoNS.Environment }).MonacoEnvironment = {
  // No TS/JSON/CSS/HTML language services are registered, so the base worker is the only one.
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

export { monaco };
