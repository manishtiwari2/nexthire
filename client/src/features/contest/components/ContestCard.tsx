import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Clock, Users, ArrowRight, Key } from 'lucide-react';
import { Card, Badge, Button } from '../../../shared/components/ui';

interface ContestCardProps {
  contest: any;
  onJoin?: (id: string) => void;
}

export const ContestCard: React.FC<ContestCardProps> = ({ contest }) => {
  const isLive = contest.status === 'LIVE';
  const isEnded = contest.status === 'ENDED';
  const joinCode = contest.invites?.[0]?.code || contest.joinCode || 'DSA-SESSION';

  const statusVariant = isLive ? 'danger' : isEnded ? 'default' : 'info';
  const startLabel = contest.startTime
    ? new Date(contest.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Card interactive className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant} dot pulse={isLive}>
            {contest.status}
          </Badge>
          <span className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low px-2 py-0.5 font-mono text-[11px] font-semibold text-on-surface-variant">
            <Key className="h-3 w-3 text-on-surface-muted" /> {joinCode}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-on-surface-muted">
          <Users className="h-3.5 w-3.5" /> {contest._count?.participants || 0}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Trophy className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-on-surface">{contest.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">{contest.description}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-outline-variant pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-muted">
          <Clock className="h-3.5 w-3.5" /> {startLabel}
        </span>
        <Link to={`/contest/${contest.id}`}>
          <Button size="sm" variant={isLive ? 'primary' : 'secondary'} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
            {isLive ? 'Enter IDE' : 'View Session'}
          </Button>
        </Link>
      </div>
    </Card>
  );
};
