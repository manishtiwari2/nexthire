import React, { useState } from 'react';
import { BookOpen, X, Copy, Check } from 'lucide-react';
import type { SupportedLanguage } from '../../store/useEditorStore';
import { LANGUAGE_REFERENCE } from './languageReference';
import { cn } from '../../shared/lib/cn';

interface LanguageDocsPanelProps {
  open: boolean;
  language: SupportedLanguage;
  onClose: () => void;
}

const Snippet: React.FC<{ label: string; code: string }> = ({ label, code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1200); },
      () => { /* clipboard unavailable — ignore */ }
    );
  };
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-on-surface-variant">{label}</p>
      <div className="group relative">
        <pre className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-low p-2.5 pr-9 font-mono text-[11.5px] leading-relaxed text-on-surface">{code}</pre>
        <button
          onClick={copy}
          aria-label="Copy snippet"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-outline-variant bg-surface-container text-on-surface-muted opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};

/**
 * Slide-over quick-reference panel for the active language, rendered inside the editor card.
 * Content is generic syntax/I/O help — never problem-specific — so it aids recall without
 * giving away solutions.
 */
export const LanguageDocsPanel: React.FC<LanguageDocsPanelProps> = ({ open, language, onClose }) => {
  if (!open) return null;
  const doc = LANGUAGE_REFERENCE[language];

  return (
    <div className="absolute inset-0 z-30 flex justify-end">
      <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className={cn('animate-slide-in relative flex h-full w-full max-w-sm flex-col border-l border-outline-variant bg-surface-container-lowest shadow-elev-3')}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-on-surface">{doc.name} reference</h3>
              <p className="text-[10px] text-on-surface-muted">Quick syntax help · no solution hints</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close reference"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <p className="rounded-lg border border-info/25 bg-info-container/40 px-3 py-2 text-[11px] leading-relaxed text-on-surface-variant">{doc.note}</p>
          {doc.sections.map((section) => (
            <div key={section.title} className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wide text-on-surface-muted">{section.title}</h4>
              <div className="space-y-3">
                {section.snippets.map((s) => (
                  <Snippet key={s.label} label={s.label} code={s.code} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};
