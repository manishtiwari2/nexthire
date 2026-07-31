import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { ContestLeaderboard } from '../features/contest/components/ContestLeaderboard';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, Trophy, Clock, FileText, Terminal, Award } from 'lucide-react';
import { Badge, Spinner, EmptyState, Tabs } from '../shared/components/ui';
import { cn } from '../shared/lib/cn';

// Format a millisecond countdown as H:MM:SS (or MM:SS under an hour).
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const LiveContestIDEPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'problem' | 'leaderboard'>('problem');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const joinedRef = useRef(false);
  const queryClient = useQueryClient();

  const { data: contestData, isLoading, isError: isContestError } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => apiClient.get(`/contests/${id || 'active'}`),
    enabled: !!id,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['contest-leaderboard', id],
    queryFn: () => apiClient.get(`/contests/${id || 'active'}/leaderboard`),
    refetchInterval: 5000, // Poll leaderboard every 5s
  });

  // Register the current user as a participant on entry so they can submit and appear on
  // the leaderboard (the join-by-code path also does this; this covers direct entry).
  const joinMutation = useMutation({
    mutationFn: () => apiClient.post(`/contests/${id}/join`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] }),
  });

  const contest = contestData?.data;
  const questions = contest?.questions || [];
  const activeContestQuestion = questions[selectedQuestionIndex]?.question;
  const leaderboard = leaderboardData?.data || [];

  // Derive the current user's standing from the leaderboard (presentational only).
  const myIndex = leaderboard.findIndex(
    (p: any) => p.user?.id === user?.id || (user?.email && p.user?.email === user.email)
  );
  const myEntry = myIndex >= 0 ? leaderboard[myIndex] : null;

  // Tick every second to drive the live countdown.
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-join once, when the contest is loaded and still joinable.
  useEffect(() => {
    if (!id || joinedRef.current || !contest) return;
    if (contest.status === 'ENDED') return;
    joinedRef.current = true;
    joinMutation.mutate();
  }, [id, contest]);

  // Timing: the endTime is authoritative. When it passes, the contest is over.
  const startMs = contest?.startTime ? new Date(contest.startTime).getTime() : null;
  const endMs = contest?.endTime ? new Date(contest.endTime).getTime() : null;
  const notStarted = startMs != null && nowTs < startMs;
  const hasEnded = contest?.status === 'ENDED' || (endMs != null && nowTs >= endMs);
  const remainingMs = endMs != null ? endMs - nowTs : 0;

  // When the timer reaches zero, refresh contest + leaderboard so the server-side ENDED
  // status and final standings are reflected.
  const endedHandledRef = useRef(false);
  useEffect(() => {
    if (hasEnded && !endedHandledRef.current && contest) {
      endedHandledRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['contest', id] });
      queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] });
    }
  }, [hasEnded, contest, id, queryClient]);

  const editorDisabledReason = hasEnded
    ? 'This contest has ended — submissions are closed.'
    : notStarted
      ? 'This contest has not started yet.'
      : undefined;

  const urgent = remainingMs <= 60000;
  const warning = remainingMs <= 300000 && !urgent;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top session bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/contests"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Leave</span>
          </Link>
          <div className="hidden h-4 w-px bg-outline-variant sm:block" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Terminal className="h-4 w-4" />
            </span>
            <h1 className="truncate text-sm font-semibold text-on-surface">{contest?.title || 'Coding Contest'}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {myEntry && (
            <span className="hidden items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-1 text-xs font-medium text-on-surface-variant md:inline-flex">
              <Award className="h-3.5 w-3.5 text-warning" />
              Rank <span className="font-bold text-on-surface">#{myIndex + 1}</span>
              <span className="text-on-surface-muted">·</span>
              <span className="font-mono font-bold text-primary">{myEntry.score || 0}</span> pts
            </span>
          )}

          {hasEnded ? (
            <Badge variant="default" className="px-3 py-1">
              <Clock className="h-3.5 w-3.5" /> ENDED
            </Badge>
          ) : notStarted ? (
            <Badge variant="info" className="px-3 py-1" dot pulse>
              <Clock className="h-3.5 w-3.5" /> STARTS SOON
            </Badge>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-sm font-bold tabular-nums',
                urgent
                  ? 'animate-pulse border-danger/40 bg-error-container text-danger'
                  : warning
                    ? 'border-warning/40 bg-warning-container text-warning'
                    : 'border-success/40 bg-success-container text-success'
              )}
              title="Time remaining"
            >
              <Clock className="h-3.5 w-3.5" /> {endMs != null ? formatRemaining(remainingMs) : 'LIVE'}
            </span>
          )}
        </div>
      </header>

      {/* Split interface */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row lg:gap-4 lg:p-4">
        {/* Left: problem / leaderboard */}
        <div className="flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elev-1 lg:h-full lg:w-[44%]">
          <div className="shrink-0 border-b border-outline-variant px-4">
            <Tabs<'problem' | 'leaderboard'>
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { value: 'problem', label: 'Problem', icon: <FileText />, count: questions.length },
                { value: 'leaderboard', label: 'Leaderboard', icon: <Trophy />, count: leaderboard.length },
              ]}
            />
          </div>

          {/* Question navigator */}
          {activeTab === 'problem' && questions.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-outline-variant bg-surface-container-low p-3">
              {questions.map((cq: any, idx: number) => (
                <button
                  key={cq.id || idx}
                  onClick={() => setSelectedQuestionIndex(idx)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
                    selectedQuestionIndex === idx
                      ? 'bg-primary text-on-primary shadow-elev-1'
                      : 'border border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline hover:text-on-surface'
                  )}
                >
                  Q{idx + 1}
                  <span className="ml-1 opacity-70">· {cq.points ?? 100}pt</span>
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'problem' ? (
              isLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner label="Loading problems…" />
                </div>
              ) : isContestError ? (
                <EmptyState icon={<FileText />} title="Failed to load contest" description="Please leave and re-enter the session." />
              ) : !activeContestQuestion ? (
                <EmptyState icon={<FileText />} title="No problem selected" description="Select a question from the navigator above." />
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold tracking-tight text-on-surface">{activeContestQuestion.title}</h2>
                    <Badge variant="primary">{activeContestQuestion.topic?.name || 'Algorithms'}</Badge>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                    {activeContestQuestion.description}
                  </div>
                  {activeContestQuestion.constraints && (
                    <div className="space-y-1.5 rounded-xl border border-outline-variant bg-surface-container-low p-3">
                      <h4 className="text-xs font-semibold text-on-surface">Constraints</h4>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-on-surface-variant">
                        {activeContestQuestion.constraints}
                      </pre>
                    </div>
                  )}
                </div>
              )
            ) : (
              <ContestLeaderboard participants={leaderboard} />
            )}
          </div>
        </div>

        {/* Right: Monaco editor */}
        <div className="min-h-[360px] flex-1 lg:h-full">
          <MonacoCodeEditor
            questionId={activeContestQuestion?.id}
            roomCode={`CONTEST-${id}`}
            contestId={id}
            disabledReason={editorDisabledReason}
            onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] })}
          />
        </div>
      </div>
    </div>
  );
};
