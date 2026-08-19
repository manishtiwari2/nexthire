import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw, Flame, CheckCircle2, Gauge, AlertTriangle, CalendarClock, PlayCircle,
  X, ExternalLink, ArrowRight, Layers, Clock
} from 'lucide-react';
import { SectionHeader, Card, Badge, DifficultyBadge, Button, Skeleton, SkeletonCard, EmptyState, StatCard } from '../shared/components/ui';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { fetchRevisionState, removeRevision, type RevisionItem } from '../features/revision/api';
import type { QuestionCard } from '../features/library/types';

function solveTarget(q: QuestionCard): { external: boolean; href: string } {
  if (q.isExternalOnly && q.sourceUrl) return { external: true, href: q.sourceUrl };
  return { external: false, href: `/questions/${q.id}` };
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((d.setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Static class strings so Tailwind's JIT can see them (never build `text-${tone}`).
const TONE = {
  danger: { text: 'text-danger', badge: 'danger' as const },
  warning: { text: 'text-warning', badge: 'warning' as const },
  info: { text: 'text-info', badge: 'info' as const },
};
type Tone = keyof typeof TONE;

const RevisionRow: React.FC<{ item: RevisionItem; tone: Tone; onRemove: (id: string) => void }> = ({ item, tone, onRemove }) => {
  const t = solveTarget(item.question);
  const Inner = (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <DifficultyBadge difficulty={item.question.difficulty} />
        <span className="truncate text-sm font-medium text-on-surface group-hover:text-primary">{item.question.title}</span>
        {item.question.isExternalOnly && <ExternalLink className="h-3 w-3 shrink-0 text-on-surface-muted" />}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-on-surface-muted">
        {item.reviewCount > 0 && <span className="hidden sm:inline">{item.reviewCount}× reviewed</span>}
        <span className={`inline-flex items-center gap-1 font-medium ${TONE[tone].text}`}>
          <CalendarClock className="h-3.5 w-3.5" /> {whenLabel(item.nextReviewAt)}
        </span>
        <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </>
  );
  return (
    <div className="group flex items-center gap-2">
      {t.external ? (
        <a href={t.href} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-outline-variant hover:bg-surface-container-high">{Inner}</a>
      ) : (
        <Link to={t.href} className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-outline-variant hover:bg-surface-container-high">{Inner}</Link>
      )}
      <button
        onClick={() => onRemove(item.questionId)}
        aria-label="Remove from revision"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-on-surface-muted transition-colors hover:bg-error-container hover:text-danger"
      ><X className="h-4 w-4" /></button>
    </div>
  );
};

const Bucket: React.FC<{
  icon: React.ReactNode; title: string; tone: Tone;
  items: RevisionItem[]; emptyHint: string; onRemove: (id: string) => void;
}> = ({ icon, title, tone, items, emptyHint, onRemove }) => (
  <div>
    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
      <span className={`${TONE[tone].text} [&>svg]:h-4 [&>svg]:w-4`}>{icon}</span>
      {title}
      <Badge variant={TONE[tone].badge}>{items.length}</Badge>
    </h2>
    <Card className="p-2">
      {items.length ? (
        <div className="divide-y divide-outline-variant/50">
          {items.map((it) => <RevisionRow key={it.questionId} item={it} tone={tone} onRemove={onRemove} />)}
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-sm text-on-surface-muted">{emptyHint}</p>
      )}
    </Card>
  </div>
);

export const RevisionPage: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useNotificationStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['revision'], queryFn: fetchRevisionState, enabled: !!user });

  const removeMutation = useMutation({
    mutationFn: (questionId: string) => removeRevision(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revision'] });
      queryClient.invalidateQueries({ queryKey: ['revision-queue'] });
      queryClient.invalidateQueries({ queryKey: ['progress-stats'] });
      addToast('Removed', 'Question removed from your revision ladder.', 'success');
    },
  });

  const startRevision = () => {
    const first = data?.overdue[0] || data?.dueToday[0];
    if (!first) return;
    const t = solveTarget(first.question);
    if (t.external) window.open(t.href, '_blank');
    else navigate(t.href);
  };

  const stats = data?.stats;
  const dueNow = (data?.overdue.length || 0) + (data?.dueToday.length || 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<RotateCcw />}
        title="Revision"
        description="Spaced repetition keeps solved problems fresh. Solving a problem adds it here automatically."
        actions={
          dueNow > 0 ? (
            <Button leftIcon={<PlayCircle className="h-4 w-4" />} onClick={startRevision}>Start Revision ({dueNow})</Button>
          ) : undefined
        }
      />

      {isLoading || !data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      ) : stats && stats.totalTracked === 0 ? (
        <Card>
          <EmptyState
            icon={<RotateCcw />}
            title="Your revision ladder is empty"
            description="Solve a problem and it's automatically scheduled for spaced-repetition review. You can also rate your confidence on any problem's page to add it."
            action={<Link to="/practice"><Button leftIcon={<PlayCircle className="h-4 w-4" />}>Start practicing</Button></Link>}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Flame />} accent="warning" label="Due now" value={stats?.dueCount ?? 0} hint={stats?.overdueCount ? `${stats.overdueCount} overdue` : 'stay on top of it'} />
            <StatCard icon={<CalendarClock />} accent="info" label="Upcoming" value={stats?.upcomingCount ?? 0} hint="scheduled ahead" />
            <StatCard icon={<Layers />} accent="primary" label="In rotation" value={stats?.totalTracked ?? 0} hint="total tracked" />
            <StatCard icon={<Gauge />} accent="success" label="Confidence" value={`${stats?.confidence ?? 0}%`} hint={`avg ease ${stats?.avgEase ?? 0}`} />
          </div>

          <div className="space-y-6">
            <Bucket icon={<AlertTriangle />} title="Overdue" tone="danger" items={data.overdue}
              emptyHint="Nothing overdue — nice discipline." onRemove={removeMutation.mutate} />
            <Bucket icon={<Clock />} title="Due Today" tone="warning" items={data.dueToday}
              emptyHint="No reviews due today." onRemove={removeMutation.mutate} />
            <Bucket icon={<CheckCircle2 />} title="Upcoming" tone="info" items={data.upcoming}
              emptyHint="No upcoming reviews scheduled yet." onRemove={removeMutation.mutate} />
          </div>
        </>
      )}
    </div>
  );
};

export default RevisionPage;
