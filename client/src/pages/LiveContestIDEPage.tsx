import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { ContestLeaderboard } from '../features/contest/components/ContestLeaderboard';
import { ArrowLeft, Trophy, Clock, FileText } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'problem' | 'leaderboard'>('problem');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const joinedRef = useRef(false);
  const queryClient = useQueryClient();

  const { data: contestData, isLoading, isError: isContestError } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => apiClient.get(`/contests/${id || 'active'}`),
    enabled: !!id
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['contest-leaderboard', id],
    queryFn: () => apiClient.get(`/contests/${id || 'active'}/leaderboard`),
    refetchInterval: 5000 // Poll leaderboard every 5s
  });

  // Register the current user as a participant on entry so they can submit and appear on
  // the leaderboard (the join-by-code path also does this; this covers direct entry).
  const joinMutation = useMutation({
    mutationFn: () => apiClient.post(`/contests/${id}/join`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] })
  });

  const contest = contestData?.data;
  const questions = contest?.questions || [];
  const activeContestQuestion = questions[selectedQuestionIndex]?.question;
  const leaderboard = leaderboardData?.data || [];

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

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Top Session Bar */}
      <header className="h-14 bg-slate-900 text-white px-6 flex items-center justify-between shadow-md z-10 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link to="/contests" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Leave Contest
          </Link>
          <div className="h-4 w-px bg-slate-700" />
          <h1 className="font-bold text-sm text-slate-100">{contest?.title || 'Speed Coding Contest'}</h1>
        </div>

        <div className="flex items-center gap-4">
          {hasEnded ? (
            <span className="px-3 py-1 bg-slate-700 text-white text-xs font-mono font-bold rounded-full flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> CONTEST ENDED
            </span>
          ) : notStarted ? (
            <span className="px-3 py-1 bg-blue-600 text-white text-xs font-mono font-bold rounded-full flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> STARTS SOON
            </span>
          ) : (
            <span
              className={`px-3 py-1 text-white text-xs font-mono font-bold rounded-full flex items-center gap-1.5 ${
                remainingMs <= 60000 ? 'bg-red-600 animate-pulse' : 'bg-emerald-600'
              }`}
              title="Time remaining"
            >
              <Clock className="w-3.5 h-3.5" /> {endMs != null ? formatRemaining(remainingMs) : 'LIVE'}
            </span>
          )}
        </div>
      </header>

      {/* Main Split Interface */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left Side: Problem Statement or Leaderboard */}
        <div className="w-[45%] bg-white rounded-2xl border border-outline-variant flex flex-col overflow-hidden shadow-sm">
          {/* Tab Controls */}
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('problem')}
                className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                  activeTab === 'problem' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" /> Problems ({questions.length})
              </button>
              <button
                onClick={() => setActiveTab('leaderboard')}
                className={`py-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                  activeTab === 'leaderboard' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Trophy className="w-4 h-4 text-amber-500" /> Leaderboard ({leaderboard.length})
              </button>
            </div>
          </div>

          {/* Question Selector Bar */}
          {activeTab === 'problem' && questions.length > 0 && (
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-2">
              {questions.map((cq: any, idx: number) => (
                <button
                  key={cq.id || idx}
                  onClick={() => setSelectedQuestionIndex(idx)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    selectedQuestionIndex === idx ? 'bg-primary text-white shadow-sm' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Problem {idx + 1} ({cq.points ?? 100} pts)
                </button>
              ))}
            </div>
          )}

          {/* Content Body */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {activeTab === 'problem' ? (
              isLoading ? (
                <p className="text-xs text-slate-500">Loading contest problems...</p>
              ) : isContestError ? (
                <p className="text-xs text-red-500">Failed to load contest.</p>
              ) : !activeContestQuestion ? (
                <p className="text-xs text-slate-500">No active problem selected.</p>
              ) : (
                <>
                  <div>
                    <h2 className="text-xl font-bold text-on-surface mb-1">{activeContestQuestion.title}</h2>
                    <span className="text-xs font-semibold text-primary">{activeContestQuestion.topic?.name || 'Algorithms'}</span>
                  </div>

                  <div className="text-xs leading-relaxed text-on-surface-variant whitespace-pre-wrap">
                    {activeContestQuestion.description}
                  </div>

                  {activeContestQuestion.constraints && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <h4 className="font-bold text-xs text-slate-700">Constraints:</h4>
                      <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap">{activeContestQuestion.constraints}</pre>
                    </div>
                  )}
                </>
              )
            ) : (
              <ContestLeaderboard participants={leaderboard} />
            )}
          </div>
        </div>

        {/* Right Side: Monaco Editor */}
          <MonacoCodeEditor
            questionId={activeContestQuestion?.id}
            roomCode={`CONTEST-${id}`}
            contestId={id}
            disabledReason={editorDisabledReason}
            onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['contest-leaderboard', id] })}
          />
      </div>
    </div>
  );
};
