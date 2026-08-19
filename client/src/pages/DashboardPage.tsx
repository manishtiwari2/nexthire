import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Flame, RotateCcw, Target, CheckCircle2, ArrowRight, Zap, BookMarked, ListChecks,
  Trophy, Clock, TrendingUp, Sparkles, PlayCircle, Dumbbell, Award, AlertTriangle,
  ExternalLink, Minus, Plus, Activity as ActivityIcon, ChevronRight
} from 'lucide-react';
import { Card, Badge, DifficultyBadge, Button, Skeleton, EmptyState } from '../shared/components/ui';
import { useAuthStore } from '../store/useAuthStore';
import { apiClient } from '../api/client';
import {
  fetchProgressStats, fetchActivity, fetchDaily, fetchRevisionQueue, fetchProgressList, fetchSheets
} from '../features/library/api';
import type { QuestionCard, ProgressDto } from '../features/library/types';

/* ------------------------------ helpers ------------------------------ */

const GOAL_KEY = 'nexthire_daily_goal';
const utcDay = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const todayUTC = () => new Date().toISOString().slice(0, 10);

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relTime(iso?: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Where "Solve" should take the user for a given question. */
function solveTarget(q: QuestionCard): { external: boolean; href: string } {
  if (q.isExternalOnly && q.sourceUrl) return { external: true, href: q.sourceUrl };
  return { external: false, href: `/questions/${q.id}` };
}

const SolveLink: React.FC<{ q: QuestionCard; children: React.ReactNode; className?: string }> = ({ q, children, className }) => {
  const t = solveTarget(q);
  return t.external ? (
    <a href={t.href} target="_blank" rel="noreferrer" className={className}>{children}</a>
  ) : (
    <Link to={t.href} className={className}>{children}</Link>
  );
};

/* ------------------------------ small pieces ------------------------------ */

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode; to?: string; action?: string }> = ({ icon, children, to, action }) => (
  <div className="mb-3 flex items-center justify-between">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
      <span className="text-on-surface-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {children}
    </h2>
    {to && (
      <Link to={to} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
        {action || 'View all'} <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    )}
  </div>
);

/** Circular "Today's Goal" ring with an inline target stepper. */
const GoalRing: React.FC<{ solved: number; target: number; onTarget: (n: number) => void }> = ({ solved, target, onTarget }) => {
  const pct = target > 0 ? Math.min(100, (solved / target) * 100) : 0;
  const R = 34;
  const C = 2 * Math.PI * R;
  const done = solved >= target && target > 0;
  return (
    <Card className="flex items-center gap-5 p-5">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
          <circle cx="40" cy="40" r={R} className="fill-none stroke-surface-container-high" strokeWidth="7" />
          <circle
            cx="40" cy="40" r={R}
            className={`fill-none transition-all duration-500 ${done ? 'stroke-success' : 'stroke-primary'}`}
            strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {done ? <CheckCircle2 className="h-7 w-7 text-success" /> : (
            <>
              <span className="text-xl font-bold text-on-surface">{solved}</span>
              <span className="text-[10px] font-medium text-on-surface-muted">/ {target}</span>
            </>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          <Target className="h-3.5 w-3.5" /> Today's Goal
        </p>
        <p className="mt-1 text-sm font-semibold text-on-surface">
          {done ? 'Goal complete — nice work!' : `${Math.max(0, target - solved)} more to hit your goal`}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={() => onTarget(Math.max(1, target - 1))}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Lower goal"
          ><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-14 text-center text-xs text-on-surface-muted">target {target}</span>
          <button
            onClick={() => onTarget(Math.min(20, target + 1))}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Raise goal"
          ><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </Card>
  );
};

const MiniStat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; accent: string }> = ({ icon, label, value, hint, accent }) => (
  <Card className="flex items-center gap-4 p-5">
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent} [&>svg]:h-6 [&>svg]:w-6`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="text-2xl font-bold tracking-tight text-on-surface">{value}</p>
      {hint && <p className="truncate text-xs text-on-surface-muted">{hint}</p>}
    </div>
  </Card>
);

/** GitHub-style submission heatmap built from the activity calendar map. */
const Heatmap: React.FC<{ calendar: Record<string, number> }> = ({ calendar }) => {
  const { columns, months } = useMemo(() => {
    const WEEKS = 26;
    const total = WEEKS * 7;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const end = new Date(today); end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - (total - 1));

    const cols: Array<Array<{ key: string; count: number; future: boolean }>> = [];
    const monthMarks: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    const cur = new Date(start);
    for (let w = 0; w < WEEKS; w += 1) {
      const col: Array<{ key: string; count: number; future: boolean }> = [];
      for (let d = 0; d < 7; d += 1) {
        const key = cur.toISOString().slice(0, 10);
        const future = cur > today;
        col.push({ key, count: calendar[key] || 0, future });
        if (d === 0 && cur.getUTCMonth() !== lastMonth) {
          lastMonth = cur.getUTCMonth();
          monthMarks.push({ col: w, label: cur.toLocaleString('en', { month: 'short' }) });
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      cols.push(col);
    }
    return { columns: cols, months: monthMarks };
  }, [calendar]);

  const level = (c: number) =>
    c === 0 ? 'bg-surface-container-high'
      : c === 1 ? 'bg-success/30'
        : c <= 3 ? 'bg-success/55'
          : c <= 6 ? 'bg-success/80'
            : 'bg-success';

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="mb-1 flex gap-[3px] pl-1 text-[9px] text-on-surface-muted">
          {columns.map((_, i) => {
            const mark = months.find((m) => m.col === i);
            return <div key={i} className="w-3">{mark ? mark.label : ''}</div>;
          })}
        </div>
        <div className="flex gap-[3px]">
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((cell) => (
                <div
                  key={cell.key}
                  title={cell.future ? '' : `${cell.key} · ${cell.count} submission${cell.count === 1 ? '' : 's'}`}
                  className={`h-3 w-3 rounded-[3px] ${cell.future ? 'bg-transparent' : level(cell.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-on-surface-muted">
          Less
          <span className="h-3 w-3 rounded-[3px] bg-surface-container-high" />
          <span className="h-3 w-3 rounded-[3px] bg-success/30" />
          <span className="h-3 w-3 rounded-[3px] bg-success/55" />
          <span className="h-3 w-3 rounded-[3px] bg-success/80" />
          <span className="h-3 w-3 rounded-[3px] bg-success" />
          More
        </div>
      </div>
    </div>
  );
};

/** Compact question row used across revision / activity / bookmark lists. */
const QuestionRow: React.FC<{ q: QuestionCard; right?: React.ReactNode }> = ({ q, right }) => (
  <SolveLink q={q} className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-outline-variant hover:bg-surface-container-high">
    <div className="flex min-w-0 items-center gap-2.5">
      <DifficultyBadge difficulty={q.difficulty} />
      <span className="truncate text-sm font-medium text-on-surface group-hover:text-primary">{q.title}</span>
      {q.isExternalOnly && <ExternalLink className="h-3 w-3 shrink-0 text-on-surface-muted" />}
    </div>
    {right ?? <ArrowRight className="h-4 w-4 shrink-0 text-on-surface-muted opacity-0 transition-opacity group-hover:opacity-100" />}
  </SolveLink>
);

/* ------------------------------ page ------------------------------ */

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const enabled = !!user;
  const [target, setTarget] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(GOAL_KEY) || '3', 10);
    return Number.isFinite(v) && v > 0 ? v : 3;
  });
  const setGoal = (n: number) => { setTarget(n); localStorage.setItem(GOAL_KEY, String(n)); };

  const statsQ = useQuery({ queryKey: ['progress-stats'], queryFn: fetchProgressStats, enabled });
  const activityQ = useQuery({ queryKey: ['activity'], queryFn: fetchActivity, enabled });
  const dailyQ = useQuery({ queryKey: ['daily'], queryFn: fetchDaily, enabled });
  const revisionQ = useQuery({ queryKey: ['revision-queue'], queryFn: fetchRevisionQueue, enabled });
  const progressQ = useQuery({ queryKey: ['progress-list'], queryFn: () => fetchProgressList(), enabled });
  const sheetsQ = useQuery({ queryKey: ['sheets'], queryFn: fetchSheets, enabled });
  const contestsQ = useQuery({ queryKey: ['contests'], queryFn: () => apiClient.get('/contests'), enabled });

  const stats = statsQ.data;
  const activity = activityQ.data;
  const daily = dailyQ.data?.question || null;
  const revision = revisionQ.data || [];
  const tracked = (progressQ.data || []) as Array<{ question: QuestionCard; progress: ProgressDto }>;
  const sheets = sheetsQ.data || [];
  const contests: any[] = (contestsQ.data as any)?.data || [];

  const today = todayUTC();
  const solvedToday = tracked.filter((t) => t.progress.firstSolvedAt && utcDay(t.progress.firstSolvedAt) === today).length;
  const continueLast = tracked.find((t) => t.progress.status !== 'SOLVED') || tracked[0];
  const recentActivity = tracked.slice(0, 6);
  const bookmarks = tracked.filter((t) => t.progress.isBookmarked).slice(0, 5);
  const activeContests = contests.filter((c) => c.status === 'LIVE').concat(contests.filter((c) => c.status !== 'LIVE')).slice(0, 3);

  const anyLoading = statsQ.isLoading || activityQ.isLoading;

  if (anyLoading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 w-full rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-muted">
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-on-surface">
            {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">Here's your prep at a glance. Let's keep the streak alive.</p>
        </div>
        <Link to="/practice">
          <Button leftIcon={<PlayCircle className="h-4 w-4" />}>Continue Practicing</Button>
        </Link>
      </div>

      {/* Today strip */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GoalRing solved={solvedToday} target={target} onTarget={setGoal} />
        <MiniStat
          icon={<Flame />} accent="bg-warning-container text-warning"
          label="Current Streak" value={`${activity?.currentStreak ?? 0} ${activity?.currentStreak === 1 ? 'day' : 'days'}`}
          hint={`Longest ${activity?.longestStreak ?? 0} · ${activity?.todayCount ?? 0} today`}
        />
        <MiniStat
          icon={<RotateCcw />} accent="bg-info-container text-info"
          label="Revision Due" value={stats?.revisionDue ?? 0}
          hint={revision.length ? 'Ready to review now' : 'All caught up'}
        />
        <MiniStat
          icon={<CheckCircle2 />} accent="bg-success-container text-success"
          label="Solved" value={stats?.solvedTotal ?? 0}
          hint={`of ${stats?.totalQuestions ?? 0} in library`}
        />
      </div>

      {/* Main two-column area */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left / wide */}
        <div className="space-y-6 lg:col-span-2">
          {/* Daily challenge */}
          <div>
            <SectionTitle icon={<Zap />} to="/library" action="Browse library">Daily Challenge</SectionTitle>
            {daily ? (
              <Card className="overflow-hidden p-0">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="accent"><Sparkles className="h-3 w-3" /> Today</Badge>
                      <DifficultyBadge difficulty={daily.difficulty} />
                      {daily.topic && <Badge variant="outline">{daily.topic.name}</Badge>}
                      {daily.progress?.status === 'SOLVED' && <Badge variant="success" dot>Solved</Badge>}
                    </div>
                    <h3 className="truncate text-lg font-semibold text-on-surface">{daily.title}</h3>
                    <p className="flex items-center gap-3 text-xs text-on-surface-muted">
                      {daily.estimatedTimeMin && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{daily.estimatedTimeMin} min</span>}
                      {typeof daily.acceptanceRate === 'number' && <span>{Math.round(daily.acceptanceRate)}% acceptance</span>}
                    </p>
                  </div>
                  <SolveLink q={daily}>
                    <Button rightIcon={<ArrowRight className="h-4 w-4" />}>
                      {daily.progress?.status === 'SOLVED' ? 'Revisit' : 'Solve'}
                    </Button>
                  </SolveLink>
                </div>
              </Card>
            ) : (
              <Card><EmptyState icon={<Zap />} title="No daily challenge" description="Seed the library to get a daily pick." /></Card>
            )}
          </div>

          {/* Continue where you left off */}
          {continueLast && (
            <div>
              <SectionTitle icon={<PlayCircle />}>Continue where you left off</SectionTitle>
              <Card className="p-0">
                <div className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <DifficultyBadge difficulty={continueLast.question.difficulty} />
                      <Badge variant={continueLast.progress.status === 'SOLVED' ? 'success' : continueLast.progress.status === 'ATTEMPTED' ? 'warning' : 'default'}>
                        {continueLast.progress.status}
                      </Badge>
                    </div>
                    <h3 className="truncate text-base font-semibold text-on-surface">{continueLast.question.title}</h3>
                    <p className="text-xs text-on-surface-muted">Last opened {relTime(continueLast.progress.lastPracticedAt)}</p>
                  </div>
                  <SolveLink q={continueLast.question}>
                    <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>Resume</Button>
                  </SolveLink>
                </div>
              </Card>
            </div>
          )}

          {/* Recent activity */}
          <div>
            <SectionTitle icon={<ActivityIcon />} to="/progress" action="Full progress">Recent Activity</SectionTitle>
            <Card className="p-2">
              {recentActivity.length ? (
                <div className="divide-y divide-outline-variant/50">
                  {recentActivity.map((t) => (
                    <QuestionRow
                      key={t.question.id}
                      q={t.question}
                      right={
                        <span className="flex items-center gap-2 text-xs text-on-surface-muted">
                          <Badge variant={t.progress.status === 'SOLVED' ? 'success' : t.progress.status === 'ATTEMPTED' ? 'warning' : 'default'}>
                            {t.progress.status === 'SOLVED' ? 'Solved' : t.progress.status === 'ATTEMPTED' ? 'Attempted' : 'Todo'}
                          </Badge>
                          {relTime(t.progress.lastPracticedAt)}
                        </span>
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<ActivityIcon />} title="No activity yet" description="Solve your first problem to see it here." />
              )}
            </Card>
          </div>
        </div>

        {/* Right / narrow */}
        <div className="space-y-6">
          {/* Revision queue */}
          <div>
            <SectionTitle icon={<RotateCcw />} to="/revision" action="Open">Revision Queue</SectionTitle>
            <Card className="p-2">
              {revision.length ? (
                <>
                  <div className="divide-y divide-outline-variant/50">
                    {revision.slice(0, 5).map((r) => <QuestionRow key={r.question.id} q={r.question} />)}
                  </div>
                  <div className="p-2">
                    <Link to="/revision"><Button fullWidth variant="outline" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />}>Start Revision ({revision.length})</Button></Link>
                  </div>
                </>
              ) : (
                <EmptyState icon={<CheckCircle2 />} title="Nothing due" description="You're all caught up on revision." />
              )}
            </Card>
          </div>

          {/* Weak topics */}
          <div>
            <SectionTitle icon={<AlertTriangle />} to="/progress">Weak Topics</SectionTitle>
            <Card className="p-5">
              {stats?.weakTopics?.length ? (
                <div className="flex flex-wrap gap-2">
                  {stats.weakTopics.map((t) => (
                    <Link key={t.id} to="/library">
                      <Badge variant="warning" className="cursor-pointer">{t.name} · {t.solved}/{t.seen}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-muted">Solve a few problems to surface your weak areas.</p>
              )}
            </Card>
          </div>

          {/* Bookmarks */}
          <div>
            <SectionTitle icon={<BookMarked />} to="/library">Bookmarks</SectionTitle>
            <Card className="p-2">
              {bookmarks.length ? (
                <div className="divide-y divide-outline-variant/50">
                  {bookmarks.map((t) => <QuestionRow key={t.question.id} q={t.question} />)}
                </div>
              ) : (
                <EmptyState icon={<BookMarked />} title="No bookmarks" description="Bookmark problems to revisit them fast." />
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Activity heatmap */}
      <div>
        <SectionTitle icon={<Flame />}>Activity</SectionTitle>
        <Card className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><p className="text-xs text-on-surface-muted">Current streak</p><p className="text-xl font-bold text-on-surface">{activity?.currentStreak ?? 0}d</p></div>
            <div><p className="text-xs text-on-surface-muted">Longest streak</p><p className="text-xl font-bold text-on-surface">{activity?.longestStreak ?? 0}d</p></div>
            <div><p className="text-xs text-on-surface-muted">This week</p><p className="text-xl font-bold text-on-surface">{activity?.weekCount ?? 0}</p></div>
            <div><p className="text-xs text-on-surface-muted">This month</p><p className="text-xl font-bold text-on-surface">{activity?.monthCount ?? 0}</p></div>
          </div>
          {activity && <Heatmap calendar={activity.calendar} />}
        </Card>
      </div>

      {/* Distribution + sheets */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Difficulty distribution */}
        <div>
          <SectionTitle icon={<TrendingUp />}>Difficulty Distribution</SectionTitle>
          <Card className="space-y-4 p-5">
            {([['EASY', 'Easy', 'bg-success'], ['MEDIUM', 'Medium', 'bg-warning'], ['HARD', 'Hard', 'bg-danger']] as const).map(([key, label, bar]) => {
              const solved = stats?.byDifficulty[key] || 0;
              const total = stats?.totalByDifficulty[key] || 0;
              const pct = total ? Math.round((solved / total) * 100) : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-on-surface-variant">{label}</span>
                    <span className="text-on-surface-muted">{solved} / {total}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        {/* Study sheets */}
        <div>
          <SectionTitle icon={<ListChecks />} to="/sheets">Study Sheets</SectionTitle>
          <Card className="p-2">
            {sheets.length ? (
              <div className="divide-y divide-outline-variant/50">
                {sheets.slice(0, 4).map((s) => {
                  const pct = s.total ? Math.round((s.solvedCount / s.total) * 100) : 0;
                  return (
                    <Link key={s.id} to={`/sheets/${s.slug}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-container-high">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><ListChecks className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-on-surface group-hover:text-primary">{s.name}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="shrink-0 text-[11px] text-on-surface-muted">{s.solvedCount}/{s.total}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<ListChecks />} title="No sheets yet" description="Follow a curated sheet like Blind 75 to get started." />
            )}
          </Card>
        </div>
      </div>

      {/* Recent contests */}
      <div>
        <SectionTitle icon={<Trophy />} to="/contests">Assessments</SectionTitle>
        {activeContests.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeContests.map((c) => {
              const isLive = c.status === 'LIVE';
              return (
                <Link key={c.id} to={`/contest/${c.id}`}>
                  <Card interactive className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <Badge variant={isLive ? 'danger' : c.status === 'ENDED' ? 'default' : 'info'} dot pulse={isLive}>{c.status}</Badge>
                      <Trophy className="h-4 w-4 text-on-surface-muted" />
                    </div>
                    <h3 className="truncate text-sm font-semibold text-on-surface">{c.title}</h3>
                    <p className="line-clamp-2 text-xs text-on-surface-variant">{c.description}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card><EmptyState icon={<Trophy />} title="No assessments yet" description="Join a live assessment with a code, or create one." action={<Link to="/contests"><Button variant="outline" size="sm">Go to Assessments</Button></Link>} /></Card>
        )}
      </div>

      {/* Quick actions footer */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/practice', icon: <Dumbbell className="h-5 w-5" />, label: 'Practice', desc: 'Random & mixed sets' },
          { to: '/library', icon: <BookMarked className="h-5 w-5" />, label: 'Library', desc: 'Browse all problems' },
          { to: '/sheets', icon: <ListChecks className="h-5 w-5" />, label: 'Study Sheets', desc: 'Blind 75, NeetCode…' },
          { to: '/progress', icon: <Award className="h-5 w-5" />, label: 'Progress', desc: 'Stats & mastery' },
        ].map((a) => (
          <Link key={a.to} to={a.to}>
            <Card interactive className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">{a.icon}</div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{a.label}</p>
                <p className="text-xs text-on-surface-muted">{a.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
