import React from 'react';
import { Trophy, Medal } from 'lucide-react';
import { Spinner, EmptyState, Table, THead, TBody, TR, TH, TD } from '../../../shared/components/ui';
import { cn } from '../../../shared/lib/cn';

interface ContestLeaderboardProps {
  participants: any[];
  isLoading?: boolean;
}

const medalColor = ['text-warning', 'text-on-surface-variant', 'text-tertiary'];

export const ContestLeaderboard: React.FC<ContestLeaderboardProps> = ({ participants, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Loading leaderboard…" />
      </div>
    );
  }

  if (!participants || participants.length === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="No scores yet"
        description="As candidates submit solutions, their scores will appear here in real time."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant">
      <Table>
        <THead>
          <tr>
            <TH className="w-14 text-center">Rank</TH>
            <TH>Candidate</TH>
            <TH className="text-right">Score</TH>
            <TH className="text-right">Penalty</TH>
          </tr>
        </THead>
        <TBody>
          {participants.map((p, idx) => {
            const rank = idx + 1;
            const isTop = rank <= 3;
            return (
              <TR key={p.id || idx} interactive className={cn(rank === 1 && 'bg-warning/5')}>
                <TD className="text-center">
                  {isTop ? (
                    <Medal className={cn('mx-auto h-5 w-5', medalColor[rank - 1])} />
                  ) : (
                    <span className="font-mono text-xs text-on-surface-muted">#{rank}</span>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <img
                      src={p.user?.avatarUrl || `https://api.dicebear.com/7.x/glass/svg?seed=${encodeURIComponent(p.user?.name || 'User')}`}
                      alt=""
                      className="h-7 w-7 rounded-full border border-outline-variant bg-surface-container object-cover"
                    />
                    <span className="font-medium text-on-surface">{p.user?.name || 'Anonymous Engineer'}</span>
                  </div>
                </TD>
                <TD className="text-right font-mono text-sm font-bold text-primary">{p.score || 0}</TD>
                <TD className="text-right font-mono text-xs text-on-surface-muted">{p.penalty || 0}s</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
};
