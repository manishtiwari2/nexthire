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

  const draftKey = questionId ? `nexthire_draft_${questionId}_${language}` : null;

  // Load draft / starter when the (question, language) pair changes.
  useEffect(() => {
    if (!questionId || !draftKey) return;
    const saved = localStorage.getItem(draftKey);
    skipNextSaveRef.current = true;
    setCode(saved ?? resolveStarter(starterCodes, language));
    setResult(null);
    setPhase('IDLE');
    setSaveState('saved');
    // starterCodes identity is stable per question load; keying on questionId+language is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, language]);

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
    setCode(resolveStarter(starterCodes, language));
  };

  return { saveState, resetToStarter };
}
