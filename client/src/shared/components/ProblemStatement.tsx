import React, { useState } from 'react';
import { Building2, Tag as TagIcon, Lightbulb, ChevronDown } from 'lucide-react';
import { Badge, DifficultyBadge } from './ui';
import { MarkdownContent } from './MarkdownContent';
import { cn } from '../lib/cn';

interface SampleCase {
  id?: string;
  input: string;
  expectedOutput: string;
  explanation?: string | null;
  isSample?: boolean;
}

interface QuestionLike {
  title?: string;
  difficulty?: string;
  description?: string;
  constraints?: string;
  topic?: { name?: string } | null;
  testCases?: SampleCase[];
  hints?: { content?: string }[];
  questionTags?: { tag?: { name?: string } }[];
  companyTags?: { companyTag?: { name?: string } }[];
}

interface ProblemStatementProps {
  question: QuestionLike;
  /** Show the question title + difficulty header (contest hides its own duplicate title). */
  showHeader?: boolean;
  /** Show collapsible hints inline (used where there's no dedicated Hints tab, e.g. contests). */
  showHints?: boolean;
  className?: string;
}

// A single example, LeetCode-style: labelled Input / Output / Explanation in a mono card.
const ExampleBlock: React.FC<{ index: number; tc: SampleCase }> = ({ index, tc }) => (
  <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
    <div className="border-b border-outline-variant bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface">
      Example {index}
    </div>
    <div className="space-y-2 p-3 font-mono text-xs">
      <div>
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-on-surface-muted">Input</span>
        <pre className="whitespace-pre-wrap break-words text-on-surface">{tc.input}</pre>
      </div>
      <div>
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-on-surface-muted">Output</span>
        <pre className="whitespace-pre-wrap break-words text-success">{tc.expectedOutput}</pre>
      </div>
      {tc.explanation && (
        <div>
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-on-surface-muted">Explanation</span>
          <p className="font-sans text-[12px] leading-relaxed text-on-surface-variant">{tc.explanation}</p>
        </div>
      )}
    </div>
  </div>
);

const HintsBlock: React.FC<{ hints: { content?: string }[] }> = ({ hints }) => {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
        <Lightbulb className="h-3.5 w-3.5 text-warning" /> Hints
      </h4>
      {hints.map((h, i) => {
        const isOpen = open.has(i);
        return (
          <div key={i} className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
            <button
              onClick={() => toggle(i)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <span>Hint {i + 1}</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="border-t border-outline-variant px-3 py-2">
                <MarkdownContent content={h.content} className="text-[13px]" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ProblemStatement: React.FC<ProblemStatementProps> = ({
  question,
  showHeader = true,
  showHints = false,
  className,
}) => {
  const samples = (question.testCases || []).filter((tc) => tc.isSample !== false);
  const topics = (question.questionTags || []).map((t) => t.tag?.name).filter(Boolean) as string[];
  const companies = (question.companyTags || []).map((c) => c.companyTag?.name).filter(Boolean) as string[];
  const hints = (question.hints || []).filter((h) => h.content);

  return (
    <div className={cn('space-y-5', className)}>
      {showHeader && (
        <div className="space-y-2.5">
          <h2 className="text-xl font-bold tracking-tight text-on-surface">{question.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty={question.difficulty} />
            {question.topic?.name && <Badge variant="primary">{question.topic.name}</Badge>}
          </div>
        </div>
      )}

      {/* Description (markdown) */}
      <MarkdownContent content={question.description} />

      {/* Examples */}
      {samples.length > 0 && (
        <div className="space-y-3">
          {samples.map((tc, i) => (
            <ExampleBlock key={tc.id || i} index={i + 1} tc={tc} />
          ))}
        </div>
      )}

      {/* Constraints */}
      {question.constraints && question.constraints.trim() && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-on-surface">Constraints</h4>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <MarkdownContent content={question.constraints} className="font-mono text-[12px]" />
          </div>
        </div>
      )}

      {/* Inline hints (contest surface) */}
      {showHints && hints.length > 0 && <HintsBlock hints={hints} />}

      {/* Topic + company tags */}
      {(topics.length > 0 || companies.length > 0) && (
        <div className="space-y-2 border-t border-outline-variant pt-4">
          {topics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 flex items-center gap-1 text-[11px] font-medium text-on-surface-muted">
                <TagIcon className="h-3 w-3" /> Topics
              </span>
              {topics.map((t) => (
                <Badge key={t} variant="outline">{t}</Badge>
              ))}
            </div>
          )}
          {companies.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 flex items-center gap-1 text-[11px] font-medium text-on-surface-muted">
                <Building2 className="h-3 w-3" /> Companies
              </span>
              {companies.map((c) => (
                <Badge key={c} variant="accent">{c}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProblemStatement;
