import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, CheckCircle2, CircleDashed, Bookmark, RotateCcw, AlertTriangle, Clock } from 'lucide-react';
import { SectionHeader, StatCard, Card, Skeleton, Badge, Button } from '../shared/components/ui';
import { fetchProgressStats } from '../features/library/api';
import type { Difficulty } from '../features/library/types';

const DIFF_META: Array<{ key: Difficulty; label: string; bar: string }> = [
  { key: 'EASY', label: 'Easy', bar: 'bg-success' },
  { key: 'MEDIUM', label: 'Medium', bar: 'bg-warning' },
  { key: 'HARD', label: 'Hard', bar: 'bg-danger' }
];

function fmtDuration(sec?: number | null) {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export const ProgressPage: React.FC = () => {
  const { data: stats, isLoading } = useQuery({ queryKey: ['progress-stats'], queryFn: fetchProgressStats });

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<TrendingUp />}
        title="Your Progress"
        description="Track what you've solved, where you're weak, and what's due for revision."
      />

      {isLoading || !stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<CheckCircle2 />} accent="success" label="Solved" value={stats.solvedTotal} hint={`of ${stats.totalQuestions} in library`} />
            <StatCard icon={<CircleDashed />} accent="warning" label="Attempted" value={stats.attemptedTotal} />
            <StatCard icon={<Bookmark />} accent="info" label="Bookmarked" value={stats.bookmarkedTotal} />
            <StatCard icon={<Clock />} accent="primary" label="Avg. time to solve" value={fmtDuration(stats.avgSolveSec)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Solved by difficulty */}
            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-on-surface">Solved by difficulty</h2>
              <div className="space-y-3">
                {DIFF_META.map((d) => {
                  const solved = stats.byDifficulty[d.key] || 0;
                  const total = stats.totalByDifficulty[d.key] || 0;
                  const pct = total ? Math.round((solved / total) * 100) : 0;
                  return (
                    <div key={d.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-on-surface-variant">{d.label}</span>
                        <span className="text-on-surface-muted">{solved} / {total}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                        <div className={`h-full rounded-full ${d.bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Revision + weak topics */}
            <div className="space-y-4">
              <Card className="flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-container text-warning"><RotateCcw className="h-5 w-5" /></span>
                  <div>
                    <p className="font-semibold text-on-surface">{stats.revisionDue} due for revision</p>
                    <p className="text-xs text-on-surface-muted">Spaced-repetition items ready now</p>
                  </div>
                </div>
                <Link to="/practice"><Button size="sm" variant="outline">Review</Button></Link>
              </Card>

              <Card className="space-y-3 p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Weak topics
                </h2>
                {stats.weakTopics.length ? (
                  <div className="flex flex-wrap gap-2">
                    {stats.weakTopics.map((t) => (
                      <Link key={t.id} to="/library">
                        <Badge variant="warning" className="cursor-pointer">
                          {t.name} · {t.solved}/{t.seen}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-muted">Solve a few problems to surface your weak areas.</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
