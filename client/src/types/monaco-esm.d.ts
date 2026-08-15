/**
 * Type mapping for Monaco's deep ESM entry points.
 *
 * `monaco-editor`'s package.json exports map declares `types` only for the package root
 * (`"." -> editor.main.d.ts`); the catch-all `"./*": "./*"` subpath carries no types
 * condition, so under `moduleResolution: "bundler"` TypeScript cannot find the .d.ts that
 * actually sits next to `editor.api.js`. These declarations point the deep paths at the
 * types the package already ships.
 *
 * We import the deep entries rather than the barrel because the barrel eagerly pulls in
 * every language and language service (see monacoSetup.ts).
 */
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor';
}

/** Language/feature contributions are imported purely for their side effects. */
declare module 'monaco-editor/esm/vs/basic-languages/*';
declare module 'monaco-editor/esm/vs/editor/contrib/*';
