import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { SubmissionHistoryPanel } from '../features/question-bank/components/SubmissionHistoryPanel';
import { RevisionScheduleCard } from '../features/revision/components/RevisionScheduleCard';
import { ArrowLeft, Code2, Clock, Lightbulb, BookOpen, FileText, History, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import { Badge, DifficultyBadge, Spinner, EmptyState, Alert, Tabs } from '../shared/components/ui';

type PracticeTab = 'description' | 'hints' | 'editorial' | 'history' | 'revision';

export const LivePracticePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<PracticeTab>('description');
  const [autosaveStatus, setAutosaveStatus] = useState('Saved');
  const { code, setCode, language } = useEditorStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: () => apiClient.get(`/questions/${id}`),
    enabled: !!id,
  });

  // Fetch past submission history for candidate
  const { data: submissionsData, isLoading: isSubmissionsLoading } = useQuery({
    queryKey: ['submissions', id],
    queryFn: () => apiClient.get(`/questions/${id}/submissions`),
    enabled: !!id,
  });

  const question = data?.data;
  const submissions = submissionsData?.data || [];

  // Autosave code draft to LocalStorage with 1000ms debounce
  useEffect(() => {
    if (!id || !code) return;
    setAutosaveStatus('Saving...');
    const timer = setTimeout(() => {
      localStorage.setItem(`nexthire_draft_${id}_${language}`, code);
      setAutosaveStatus('Saved');
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, id, language]);

  // Restore saved draft on mount
  useEffect(() => {
    if (!id || !question) return;
    const savedDraft = localStorage.getItem(`nexthire_draft_${id}_${language}`);
    if (savedDraft) {
      setCode(savedDraft);
    } else if (question.starterCodes) {
      const match = question.starterCodes.find((sc: any) => sc.language?.toLowerCase() === language.toLowerCase());
      if (match && match.template) {
        setCode(match.template);
      }
    }
  }, [question, id, language]);

  const tabItems = [
    { value: 'description' as const, label: 'Description', icon: <FileText /> },
    { value: 'hints' as const, label: 'Hints', icon: <Lightbulb />, count: question?.hints?.length || 0 },
    { value: 'editorial' as const, label: 'Editorial', icon: <BookOpen /> },
    { value: 'history' as const, label: 'History', icon: <History /> },
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

        <div className="flex shrink-0 items-center gap-2.5 text-xs text-on-surface-muted">
          <Badge variant={autosaveStatus === 'Saved' ? 'success' : 'default'} className="hidden sm:inline-flex">
            {autosaveStatus}
          </Badge>
          <span className="hidden items-center gap-1 font-mono md:flex">
            <Clock className="h-3.5 w-3.5 text-primary" /> {question?.timeLimitMs || 2000}ms
          </span>
        </div>
      </header>

      {/* Split body */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row lg:gap-4 lg:p-4">
        {/* Left: details & tabs */}
        <div className="flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elev-1 lg:h-full lg:w-[44%]">
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
              <div className="space-y-5">
                <div className="space-y-2">
                  <h2 className="text-lg font-bold tracking-tight text-on-surface">{question.title}</h2>
                  <Badge variant="primary">{question.topic?.name || 'Algorithms'}</Badge>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                  {question.description}
                </div>
                {question.constraints && (
                  <div className="space-y-1.5 rounded-xl border border-outline-variant bg-surface-container-low p-3">
                    <h4 className="text-xs font-semibold text-on-surface">Constraints</h4>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-on-surface-variant">{question.constraints}</pre>
                  </div>
                )}
                {question.testCases && question.testCases.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-on-surface">Sample Cases</h4>
                    {question.testCases.map((tc: any, i: number) => (
                      <div key={tc.id || i} className="space-y-1 rounded-xl border border-outline-variant bg-surface-container-low p-3 font-mono text-xs">
                        <p className="font-semibold text-on-surface">Example {i + 1}</p>
                        <p className="text-on-surface-variant"><span className="text-on-surface-muted">Input:</span> {tc.input}</p>
                        <p className="text-on-surface-variant"><span className="text-on-surface-muted">Expected:</span> {tc.expectedOutput}</p>
                        {tc.explanation && (
                          <p className="mt-1 font-sans text-[11px] italic text-on-surface-muted">{tc.explanation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
            ) : activeTab === 'editorial' ? (
              question.editorial ? (
                <div className="space-y-3 text-sm leading-relaxed text-on-surface-variant">
                  <h3 className="text-sm font-semibold text-on-surface">Official Editorial</h3>
                  <p className="whitespace-pre-wrap">{question.editorial.content}</p>
                  {question.editorial.solution && (
                    <pre className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container p-3 font-mono text-[11px] text-on-surface">
                      {question.editorial.solution}
                    </pre>
                  )}
                </div>
              ) : (
                <EmptyState icon={<BookOpen />} title="No editorial yet" description="The official editorial hasn't been published for this problem." />
              )
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

        {/* Right: Monaco editor */}
        <div className="min-h-[360px] flex-1 lg:h-full">
          <MonacoCodeEditor
            questionId={id}
            onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['submissions', id] })}
          />
        </div>
      </div>
    </div>
  );
};
