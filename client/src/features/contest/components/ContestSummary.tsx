import React from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Award, CheckCircle2, Target, XCircle, Clock, ArrowLeft, Eye, BarChart3,
} from 'lucide-react';
import { Card, Badge, Button, StatCard } from '../../../shared/components/ui';
import { ContestLeaderboard } from './ContestLeaderboard';
import { formatDuration } from '../format';
import { cn } from '../../../shared/lib/cn';

export interface PerQuestionResult {
  index: number;
  title: string;
  difficulty?: string;
  points: number;
  solved: boolean;
  attempts: number;
}

interface ContestSummaryProps {
  contest: any;
  rank: number | null;
  score: number;
  solvedCount: number;
  totalQuestions: number;
  wrongAttempts: number;
  accuracy: number;
  totalTimeSec: number | null;
  perQuestion: PerQuestionResult[];
  leaderboard: any[];
  onReview: () => void;
}

export const ContestSummary: React.FC<ContestSummaryProps> = ({
  contest, rank, score, solvedCount, totalQuestions, wrongAttempts, accuracy, totalTimeSec,
  perQuestion, leaderboard, onReview,
}) => {
  const solvedPct = totalQuestions ? Math.round((solvedCount / totalQuestions) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Link to="/contests" className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="h-4 w-4" /> Back to Assessments
        </Link>

        {/* Hero */}
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-container text-warning shadow-elev-1">
            <Trophy className="h-8 w-8" />
          </span>
          <div>
            <Badge variant="default" className="mb-2">Contest complete</Badge>
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">{contest?.title}</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              You solved <span className="font-semibold text-on-surface">{solvedCount}</span> of {totalQuestions} · finished{' '}
              {rank ? <span className="font-semibold text-primary">#{rank}</span> : 'unranked'}
            </p>
          </div>
        </Card>

        {/* Stat grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          <StatCard icon={<Award />} accent="warning" label="Final Rank" value={rank ? `#${rank}` : '—'} hint={`${leaderboard.length} participants`} />
          <StatCard icon={<Trophy />} accent="primary" label="Score" value={score} />
          <StatCard icon={<CheckCircle2 />} accent="success" label="Solved" value={`${solvedCount}/${totalQuestions}`} hint={`${solvedPct}% of problems`} />
          <StatCard icon={<Target />} accent="info" label="Accuracy" value={`${accuracy}%`} hint="accepted / submissions" />
          <StatCard icon={<XCircle />} accent="danger" label="Wrong Attempts" value={wrongAttempts} />
          <StatCard icon={<Clock />} accent="accent" label="Total Time" value={formatDuration(totalTimeSec)} />
        </div>

        {/* Performance graph — points earned per problem */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <BarChart3 className="h-4 w-4 text-primary" /> Performance breakdown
          </h2>
          <div className="space-y-3">
            {perQuestion.map((q) => {
              const earned = q.solved ? q.points : 0;
              const pct = q.points ? Math.round((earned / q.points) * 100) : 0;
              return (
                <div key={q.index} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-container-high font-mono text-[10px] font-bold text-on-surface-variant">{q.index + 1}</span>
                      <span className="truncate font-medium text-on-surface">{q.title}</span>
                    </span>
                    <span className="shrink-0 font-mono text-on-surface-muted">
                      {q.solved ? (
                        <span className="text-success">+{q.points}</span>
                      ) : q.attempts > 0 ? (
                        <span className="text-danger">{q.attempts} tries</span>
                      ) : (
                        <span>not attempted</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className={cn('h-full rounded-full transition-all', q.solved ? 'bg-success' : q.attempts > 0 ? 'bg-danger/60' : 'bg-transparent')}
                      style={{ width: `${q.solved ? pct : q.attempts > 0 ? 12 : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Final standings */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Trophy className="h-4 w-4 text-warning" /> Final Standings
          </h2>
          <ContestLeaderboard participants={leaderboard} />
        </div>

        <div className="flex flex-wrap justify-center gap-3 pb-4">
          <Button variant="secondary" onClick={onReview} leftIcon={<Eye className="h-4 w-4" />}>Review Problems</Button>
          <Link to="/contests"><Button leftIcon={<Trophy className="h-4 w-4" />}>More Assessments</Button></Link>
        </div>
      </div>
    </div>
  );
};
