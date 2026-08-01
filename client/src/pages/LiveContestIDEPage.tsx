import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { ContestLeaderboard } from '../features/contest/components/ContestLeaderboard';
import { ContestLanding } from '../features/contest/components/ContestLanding';
import { ContestSummary, type PerQuestionResult } from '../features/contest/components/ContestSummary';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { ArrowLeft, Trophy, Clock, FileText, Terminal, Award, CheckCircle2, Target } from 'lucide-react';
import { Badge, Spinner, EmptyState, Tabs } from '../shared/components/ui';
import { ProblemStatement } from '../shared/components/ProblemStatement';
import { cn } from '../shared/lib/cn';
import { formatRemaining } from '../features/contest/format';

export const LiveContestIDEPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const [activeTab, setActiveTab] = useState<'problem' | 'leaderboard'>('problem');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [entered, setEntered] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const queryClient = useQueryClient();

  const { data: contestData, isLoading, isError: isContestError } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => apiClient.get(`/contests/${id || 'active'}`),
    enabled: !!id,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['contest-leaderboard', id],
    queryFn: () => apiClient.get(`/contests/${id || 'active'}/leaderboard`),
    refetchInterval: 5000,
  });

  const contest = contestData?.data;
  const questions = contest?.questions || [];
  const activeContestQuestion = questions[selectedQuestionIndex]?.question;
  const leaderboard = leaderboardData?.data || [];

  // The caller's own contest submissions drive per-question status + the end-of-contest report.
  const { data: mySubsData } = useQuery({
    queryKey: ['contest-submissions', id],
    queryFn: () => apiClient.get('/submissions', { params: { contestId: id, limit: 100 } }),
    enabled: !!id && !!user,
    refetchInterval: 8000,
  });
  const mySubs: any[] = mySubsData?.data || [];

  // Per-question rollup: solved?, attempts. Submissions arrive newest-first.
  const perQuestion = useMemo(() => {
    const map = new Map<string, { solved: boolean; attempts: number }>();
    for (const s of mySubs) {
      const e = map.get(s.questionId) || { solved: false, attempts: 0 };
      e.attempts += 1;
      const st = s.execution?.status || s.status;
      if (st === 'ACCEPTED') e.solved = true;
      map.set(s.questionId, e);
    }
    return map;
  }, [mySubs]);

  const myIndex = leaderboard.findIndex(
    (p: any) => p.user?.id === user?.id || (user?.email && p.user?.email === user.email)
  );
  const myEntry = myIndex >= 0 ? leaderboard[myIndex] : null;
  const alreadyJoined = myIndex >= 0;

  const solvedCount = useMemo(
    () => [...perQuestion.values()].filter((e) => e.solved).length,
    [perQuestion]
  );

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Timing: endTime is authoritative.
  const startMs = contest?.startTime ? new Date(contest.startTime).getTime() : null;
  const endMs = contest?.endTime ? new Date(contest.endTime).getTime() : null;
  const notStarted = startMs != null && nowTs < startMs;
  const hasEnded = contest?.status === 'ENDED' || (endMs != null && nowTs >= endMs);
  const remainingMs = endMs != null ? endMs - nowTs : 0;

  // Join on explicit entry from the landing lobby (no more silent auto-join).
  const joinMutation = useMutation({
    mutationFn: () => apiClient.post(`/contests/${id}/join`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] }),
    onError: (err: any) => {
      addToast('Could not join', typeof err === 'string' ? err : 'You may not be registered — submissions could be rejected.', 'warning');
    },
  });
  const handleEnter = () => {
    if (!hasEnded) joinMutation.mutate();
    setEntered(true);
    setReviewing(false);
  };

  // When the timer reaches zero, refresh contest + leaderboard so ENDED status/standings show.
  const endedHandledRef = useRef(false);
  useEffect(() => {
    if (hasEnded && !endedHandledRef.current && contest) {
      endedHandledRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['contest', id] });
      queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] });
      queryClient.invalidateQueries({ queryKey: ['contest-submissions', id] });
    }
  }, [hasEnded, contest, id, queryClient]);

  if (isLoading || !contest) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        {isContestError ? (
          <EmptyState icon={<Trophy />} title="Failed to load assessment" description="Please go back and try again." action={<Link to="/contests"><span className="text-sm font-medium text-primary hover:underline">Back to Assessments</span></Link>} />
        ) : (
          <Spinner size="lg" label="Loading assessment…" />
        )}
      </div>
    );
  }

  // End screen — shown once the contest is over, unless the user chose to review problems.
  if (hasEnded && !reviewing) {
    const totalSubs = mySubs.length;
    const acceptedSubs = mySubs.filter((s) => (s.execution?.status || s.status) === 'ACCEPTED').length;
    const accuracy = totalSubs ? Math.round((acceptedSubs / totalSubs) * 100) : 0;
    const startedAt = myEntry?.startedAt ? new Date(myEntry.startedAt).getTime() : null;
    const lastSubAt = mySubs.length ? new Date(mySubs[0].createdAt).getTime() : null;
    const totalTimeSec = startedAt && lastSubAt && lastSubAt > startedAt ? Math.round((lastSubAt - startedAt) / 1000) : null;
    const perQ: PerQuestionResult[] = questions.map((cq: any, idx: number) => {
      const e = perQuestion.get(cq.question?.id) || { solved: false, attempts: 0 };
      return { index: idx, title: cq.question?.title || `Problem ${idx + 1}`, difficulty: cq.question?.difficulty, points: cq.points ?? 100, solved: e.solved, attempts: e.attempts };
    });
    return (
      <ContestSummary
        contest={contest}
        rank={myEntry ? myIndex + 1 : null}
        score={myEntry?.score || 0}
        solvedCount={solvedCount}
        totalQuestions={questions.length}
        wrongAttempts={totalSubs - acceptedSubs}
        accuracy={accuracy}
        totalTimeSec={totalTimeSec}
        perQuestion={perQ}
        leaderboard={leaderboard}
        onReview={() => setReviewing(true)}
      />
    );
  }

  // Landing lobby — until the user explicitly enters (or is reviewing after the end).
  if (!entered && !reviewing) {
    return (
      <ContestLanding
        contest={contest}
        participants={leaderboard}
        nowTs={nowTs}
        startMs={startMs}
        endMs={endMs}
        notStarted={notStarted}
        alreadyJoined={alreadyJoined}
        isJoining={joinMutation.isPending}
        onEnter={handleEnter}
      />
    );
  }

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
          <span className="hidden items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-1 text-xs font-medium text-on-surface-variant sm:inline-flex" title="Problems solved">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span className="font-bold text-on-surface">{solvedCount}</span>/{questions.length}
          </span>
          {myEntry && (
            <span className="hidden items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-1 text-xs font-medium text-on-surface-variant md:inline-flex">
              <Award className="h-3.5 w-3.5 text-warning" />
              Rank <span className="font-bold text-on-surface">#{myIndex + 1}</span>
              <span className="text-on-surface-muted">·</span>
              <span className="font-mono font-bold text-primary">{myEntry.score || 0}</span> pts
            </span>
          )}

          {hasEnded ? (
            <Badge variant="default" className="px-3 py-1"><Clock className="h-3.5 w-3.5" /> ENDED</Badge>
          ) : notStarted ? (
            <Badge variant="info" className="px-3 py-1" dot pulse><Clock className="h-3.5 w-3.5" /> STARTS SOON</Badge>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-sm font-bold tabular-nums',
                urgent ? 'animate-pulse border-danger/40 bg-error-container text-danger'
                  : warning ? 'border-warning/40 bg-warning-container text-warning'
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

          {/* Question navigator with per-question status */}
          {activeTab === 'problem' && questions.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-outline-variant bg-surface-container-low p-3">
              {questions.map((cq: any, idx: number) => {
                const st = perQuestion.get(cq.question?.id);
                const solved = st?.solved;
                const attempted = !solved && (st?.attempts || 0) > 0;
                const active = selectedQuestionIndex === idx;
                return (
                  <button
                    key={cq.id || idx}
                    onClick={() => setSelectedQuestionIndex(idx)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
                      active ? 'bg-primary text-on-primary shadow-elev-1'
                        : solved ? 'border border-success/40 bg-success-container text-success'
                          : attempted ? 'border border-warning/40 bg-warning-container text-warning'
                            : 'border border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline hover:text-on-surface'
                    )}
                    title={solved ? 'Solved' : attempted ? `${st?.attempts} attempt(s)` : 'Not attempted'}
                  >
                    {solved ? <CheckCircle2 className="h-3.5 w-3.5" /> : attempted ? <Target className="h-3.5 w-3.5" /> : null}
                    Q{idx + 1}
                    <span className="opacity-70">· {cq.points ?? 100}pt</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'problem' ? (
              isContestError ? (
                <EmptyState icon={<FileText />} title="Failed to load contest" description="Please leave and re-enter the session." />
              ) : !activeContestQuestion ? (
                <EmptyState icon={<FileText />} title="No problem selected" description="Select a question from the navigator above." />
              ) : (
                <ProblemStatement question={activeContestQuestion} showHints />
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
            starterCodes={activeContestQuestion?.starterCodes}
            contestId={id}
            disabledReason={editorDisabledReason}
            onSubmitted={() => {
              queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] });
              queryClient.invalidateQueries({ queryKey: ['contest-submissions', id] });
            }}
          />
        </div>
      </div>
    </div>
  );
};
