import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { SubmissionHistoryPanel } from '../features/question-bank/components/SubmissionHistoryPanel';
import { RevisionScheduleCard } from '../features/revision/components/RevisionScheduleCard';
import {
  ArrowLeft, Code2, Clock, Lightbulb, BookOpen, FileText, History, RotateCcw, NotebookPen,
  Target, ExternalLink, MessagesSquare, GripVertical, Gauge, Timer,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import { Spinner, EmptyState, Alert, Tabs, Button } from '../shared/components/ui';
import { DifficultyBadge } from '../shared/components/ui';
import { ProblemStatement } from '../shared/components/ProblemStatement';
import { MarkdownContent } from '../shared/components/MarkdownContent';
import { NotesPanel } from '../features/library/components/NotesPanel';
import { ProgressStatusControl } from '../features/library/components/ProgressStatusControl';
import { BookmarkButton } from '../features/library/components/BookmarkButton';
import { SourceBadge, SOURCE_LABELS } from '../features/library/components/MetadataBadges';
import { useAuthStore } from '../store/useAuthStore';

const SourceLabel = (platform?: keyof typeof SOURCE_LABELS) => (platform && SOURCE_LABELS[platform]) || 'the source platform';

type PracticeTab = 'description' | 'editorial' | 'discussion' | 'hints' | 'notes' | 'progress' | 'history' | 'revision';

const SPLIT_KEY = 'nh_problem_split';
const clampPct = (n: number) => Math.max(28, Math.min(68, n));

/** True when the viewport is at the `lg` breakpoint (where the split view is horizontal). */
function useIsDesktop() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const handler = () => setIsLg(m.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);
  return isLg;
}

export const LivePracticePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<PracticeTab>('description');
  const { setCode } = useEditorStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();

  // Resizable split (persisted). Only meaningful on desktop; mobile stacks vertically.
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [leftPct, setLeftPct] = useState(() => clampPct(parseFloat(localStorage.getItem(SPLIT_KEY) || '44')));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setLeftPct(clampPct(((e.clientX - rect.left) / rect.width) * 100));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  useEffect(() => { localStorage.setItem(SPLIT_KEY, String(Math.round(leftPct))); }, [leftPct]);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const { data, isLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: () => apiClient.get(`/questions/${id}`),
    enabled: !!id,
  });

  const { data: submissionsData, isLoading: isSubmissionsLoading } = useQuery({
    queryKey: ['submissions', id],
    queryFn: () => apiClient.get(`/questions/${id}/submissions`),
    enabled: !!id,
  });

  const question = data?.data;
  const submissions = submissionsData?.data || [];
  const isExternal = !!question?.isExternalOnly;

  const tabItems = [
    { value: 'description' as const, label: 'Description', icon: <FileText /> },
    { value: 'editorial' as const, label: 'Editorial', icon: <BookOpen /> },
    { value: 'discussion' as const, label: 'Discussion', icon: <MessagesSquare /> },
    { value: 'hints' as const, label: 'Hints', icon: <Lightbulb />, count: question?.hints?.length || 0 },
    { value: 'notes' as const, label: 'Notes', icon: <NotebookPen /> },
    { value: 'progress' as const, label: 'Progress', icon: <Target /> },
    { value: 'history' as const, label: 'History', icon: <History />, count: submissions.length || 0 },
    { value: 'revision' as const, label: 'SM-2', icon: <RotateCcw /> },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/questions"
            aria-label="Back to question bank"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="hidden h-4 w-px bg-outline-variant sm:block" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Code2 className="h-4 w-4" />
            </span>
            <h1 className="truncate text-sm font-semibold text-on-surface">{question?.title || 'Practice Problem'}</h1>
          </div>
          {question && <DifficultyBadge difficulty={question.difficulty} />}
        </div>

        <div className="flex shrink-0 items-center gap-3 text-xs text-on-surface-muted">
          {typeof question?.acceptanceRate === 'number' && (
            <span className="hidden items-center gap-1 lg:flex" title="Acceptance rate">
              <Gauge className="h-3.5 w-3.5 text-success" /> {Math.round(question.acceptanceRate)}%
            </span>
          )}
          {question?.estimatedTimeMin && (
            <span className="hidden items-center gap-1 md:flex" title="Estimated solve time">
              <Timer className="h-3.5 w-3.5 text-tertiary" /> ~{question.estimatedTimeMin}m
            </span>
          )}
          <span className="hidden items-center gap-1 font-mono md:flex" title="Time limit per test case">
            <Clock className="h-3.5 w-3.5 text-primary" /> {question?.timeLimitMs || 2000}ms
          </span>
        </div>
      </header>

      {/* Split body */}
      <div
        ref={containerRef}
        className="flex flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row lg:gap-0 lg:p-4"
      >
        {/* Left: details & tabs */}
        <div
          className="flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elev-1 lg:h-full"
          style={isDesktop ? { width: `${leftPct}%` } : undefined}
        >
          <div className="shrink-0 border-b border-outline-variant px-4">
            <Tabs<PracticeTab> value={activeTab} onChange={setActiveTab} items={tabItems} size="sm" />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner label="Loading problem…" />
              </div>
            ) : !question ? (
              <EmptyState icon={<Code2 />} title="Question not found" description="This problem may have been removed." />
            ) : activeTab === 'description' ? (
              <div className="space-y-4">
                {isExternal && (
                  <Alert variant="info" title="External problem">
                    <div className="space-y-2">
                      <p>NextHire stores only this problem's metadata and a link — the full statement lives on {SourceLabel(question.sourcePlatform)}.</p>
                      {question.sourceUrl && (
                        <a href={question.sourceUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="primary" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>Open on source</Button>
                        </a>
                      )}
                    </div>
                  </Alert>
                )}
                <ProblemStatement question={question} />
              </div>
            ) : activeTab === 'editorial' ? (
              question.editorial ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-on-surface">Official Editorial</h3>
                  <MarkdownContent content={question.editorial.content} />
                  {question.editorial.solution && (
                    <pre className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container p-3 font-mono text-[11px] text-on-surface">
                      {question.editorial.solution}
                    </pre>
                  )}
                </div>
              ) : (
                <EmptyState icon={<BookOpen />} title="No editorial yet" description="The official editorial hasn't been published for this problem." />
              )
            ) : activeTab === 'discussion' ? (
              <EmptyState
                icon={<MessagesSquare />}
                title="Discussion coming soon"
                description="Community solutions and discussion threads will appear here. For now, jot your own approach in the Notes tab."
                action={<Button size="sm" variant="outline" onClick={() => setActiveTab('notes')}>Open Notes</Button>}
              />
            ) : activeTab === 'hints' ? (
              <div className="space-y-3">
                {question.hints && question.hints.length > 0 ? (
                  question.hints.map((h: any, i: number) => (
                    <Alert key={h.id || i} variant="warning" title={`Hint #${i + 1}`}>
                      {h.content}
                    </Alert>
                  ))
                ) : (
                  <EmptyState icon={<Lightbulb />} title="No hints available" description="This problem doesn't have hints yet." />
                )}
              </div>
            ) : activeTab === 'notes' ? (
              user ? <NotesPanel questionId={id || ''} /> : <EmptyState icon={<NotebookPen />} title="Sign in to take notes" description="Your private preparation notes are saved per account." />
            ) : activeTab === 'progress' ? (
              user ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-on-surface">Mark your status</span>
                    <BookmarkButton questionId={id || ''} bookmarked={question.personal?.progress?.isBookmarked} invalidate={[['question', id]]} />
                  </div>
                  <ProgressStatusControl
                    questionId={id || ''}
                    status={question.personal?.progress?.status}
                    invalidate={[['question', id]]}
                  />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-outline-variant bg-surface-container p-3">
                      <p className="text-xs uppercase tracking-wide text-on-surface-muted">Attempts</p>
                      <p className="text-lg font-bold text-on-surface">{question.personal?.progress?.attempts ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-outline-variant bg-surface-container p-3">
                      <p className="text-xs uppercase tracking-wide text-on-surface-muted">Accepted</p>
                      <p className="text-lg font-bold text-on-surface">{question.personal?.progress?.acceptedCount ?? 0}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge platform={question.sourcePlatform} url={question.sourceUrl} />
                  </div>
                </div>
              ) : <EmptyState icon={<Target />} title="Sign in to track progress" description="Solving, attempts, and bookmarks are saved per account." />
            ) : activeTab === 'history' ? (
              <SubmissionHistoryPanel
                submissions={submissions}
                isLoading={isSubmissionsLoading}
                onSelectSubmission={(loadedCode) => setCode(loadedCode)}
              />
            ) : (
              <RevisionScheduleCard questionId={id || ''} />
            )}
          </div>
        </div>

        {/* Drag handle (desktop only) */}
        <div
          onMouseDown={startDrag}
          onDoubleClick={() => setLeftPct(44)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels (double-click to reset)"
          title="Drag to resize · double-click to reset"
          className="group relative hidden w-2 shrink-0 cursor-col-resize items-center justify-center lg:flex"
        >
          <div className="h-full w-px bg-outline-variant transition-colors group-hover:bg-primary" />
          <div className="absolute flex h-9 w-3.5 items-center justify-center rounded bg-surface-container-high opacity-0 shadow-elev-1 transition-opacity group-hover:opacity-100">
            <GripVertical className="h-3.5 w-3.5 text-on-surface-muted" />
          </div>
        </div>

        {/* Right: Monaco editor (or, for external references, a link-out panel) */}
        <div className="min-h-[360px] flex-1 lg:h-full">
          {isExternal ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elev-1">
              <div className="max-w-sm text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <ExternalLink className="h-6 w-6" />
                </span>
                <h3 className="text-base font-semibold text-on-surface">Solve on the source platform</h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  This is an external reference. Open it on {SourceLabel(question.sourcePlatform)} to read the full statement and submit there — then track your progress and notes here.
                </p>
                {question.sourceUrl && (
                  <a href={question.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
                    <Button variant="primary" rightIcon={<ExternalLink className="h-4 w-4" />}>Open problem</Button>
                  </a>
                )}
                <p className="mt-4 text-xs text-on-surface-muted">
                  Use the <span className="font-medium text-on-surface">Progress</span> and <span className="font-medium text-on-surface">Notes</span> tabs to record how it went.
                </p>
              </div>
            </div>
          ) : (
            <MonacoCodeEditor
              questionId={id}
              starterCodes={question?.starterCodes}
              onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['submissions', id] })}
            />
          )}
        </div>
      </div>
    </div>
  );
};
