import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { resolveStarter, StarterCode } from '../lib/starterTemplates';

export type SaveState = 'saved' | 'saving';

/**
 * Owns the editor's per-(question, language) code lifecycle so BOTH the practice page and
 * the live-contest IDE behave identically and correctly:
 *
 *  - On question OR language change, load a previously saved draft for that exact
 *    (question, language) pair; otherwise fall back to the question's starter template
 *    (never empty). Stale run/submit results are cleared so the console doesn't show a
 *    verdict that belongs to the previous problem.
 *  - Autosave the current code (debounced) under the same key.
 *
 * Before this hook existed, the contest IDE shared one global `code` string across every
 * question, so switching questions kept the previous problem's code and verdict.
 */
export function useEditorSession(questionId: string | undefined, starterCodes: StarterCode[] | undefined) {
  const { code, setCode, language, setResult, setPhase } = useEditorStore();
  const [saveState, setSaveState] = useState<SaveState>('saved');
  // After a programmatic load we must skip exactly one autosave, otherwise the freshly
  // loaded code would be re-written (harmless) or, worse, the OLD code could be saved under
  // the NEW key during the render where state hasn't caught up yet.
  const skipNextSaveRef = useRef(false);
  /** The starter we last wrote into the editor, so we can tell "untouched" from "edited". */
  const appliedStarterRef = useRef<string | null>(null);
  const appliedKeyRef = useRef<string | null>(null);

  const draftKey = questionId ? `nexthire_draft_${questionId}_${language}` : null;
  const starter = resolveStarter(starterCodes, language);

  // Load draft / starter when the (question, language) pair changes — and again if the
  // question's own starter templates only arrive afterwards.
  //
  // The practice page renders this editor immediately and passes `question?.starterCodes`,
  // which is `undefined` until the fetch resolves. Keyed only on (questionId, language), this
  // effect ran once against that undefined, fell back to the generic skeleton, and never
  // re-ran — so a question's own starter code was never shown. `starter` is now a dependency,
  // with a guard so a late-arriving template cannot overwrite anything the user has typed.
  useEffect(() => {
    if (!questionId || !draftKey) return;

    const keyChanged = appliedKeyRef.current !== draftKey;
    const untouched = code === appliedStarterRef.current;

    // Same problem and language, starter arrived late: only swap it in if the editor still
    // holds exactly the placeholder we put there, and the user has no saved draft.
    if (!keyChanged && !(untouched && !localStorage.getItem(draftKey))) return;

    const saved = localStorage.getItem(draftKey);
    const next = saved ?? starter;
    skipNextSaveRef.current = true;
    appliedKeyRef.current = draftKey;
    appliedStarterRef.current = saved ? null : starter;
    setCode(next);
    if (keyChanged) {
      // Stale run/submit output belongs to the previous problem.
      setResult(null);
      setPhase('IDLE');
    }
    setSaveState('saved');
    // `code` is read to detect user edits but must not re-trigger the effect on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, language, starter, draftKey]);

  // Debounced autosave of the active draft.
  useEffect(() => {
    if (!draftKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    setSaveState('saving');
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, code);
      } catch {
        /* localStorage full/unavailable — drafts are best-effort */
      }
      setSaveState('saved');
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, draftKey]);

  const resetToStarter = () => {
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
    }
    appliedStarterRef.current = starter;
    setCode(starter);
  };

  return { saveState, resetToStarter };
}
