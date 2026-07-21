import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { MonacoCodeEditor } from '../components/editor/MonacoCodeEditor';
import { ContestLeaderboard } from '../features/contest/components/ContestLeaderboard';
import { ArrowLeft, Trophy, Clock, Send, FileText } from 'lucide-react';
import { Button } from '../shared/components/ui/Button';

export const LiveContestIDEPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'problem' | 'leaderboard'>('problem');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
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

  const contest = contestData?.data;
  const questions = contest?.questions || [];
  const activeContestQuestion = questions[selectedQuestionIndex]?.question;
  const leaderboard = leaderboardData?.data || [];

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
          <span className="px-3 py-1 bg-red-600 text-white text-xs font-mono font-bold rounded-full animate-pulse flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> LIVE SESSION
          </span>
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
                  Problem {idx + 1} (100 pts)
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
        <div className="w-[55%] h-full">
          <MonacoCodeEditor questionId={activeContestQuestion?.id} roomCode={`CONTEST-${id}`} />
        </div>
      </div>
    </div>
  );
};
