import React from 'react';
import { Trophy, Medal, Award, Flame } from 'lucide-react';

interface ContestLeaderboardProps {
  participants: any[];
  isLoading?: boolean;
}

export const ContestLeaderboard: React.FC<ContestLeaderboardProps> = ({ participants, isLoading }) => {
  if (isLoading) {
    return <p className="text-xs text-slate-500 p-4">Loading leaderboard...</p>;
  }

  if (!participants || participants.length === 0) {
    return <p className="text-xs text-slate-500 p-4 text-center">No participant scores recorded yet.</p>;
  }

  return (
    <div className="bg-white rounded-3xl border border-outline-variant overflow-hidden shadow-sm">
      <div className="p-4 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
        <h3 className="font-bold text-sm text-on-surface flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" /> Live Contest Leaderboard
        </h3>
        <span className="text-xs font-mono text-slate-500">{participants.length} Active Candidates</span>
      </div>

      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-outline-variant text-slate-500 font-bold uppercase tracking-wider">
            <th className="p-3 w-12 text-center">Rank</th>
            <th className="p-3">Candidate</th>
            <th className="p-3 text-right">Score</th>
            <th className="p-3 text-right">Penalty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {participants.map((p, idx) => {
            const rank = idx + 1;
            return (
              <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 text-center font-black">
                  {rank === 1 ? (
                    <Medal className="w-5 h-5 text-yellow-500 mx-auto" />
                  ) : rank === 2 ? (
                    <Medal className="w-5 h-5 text-slate-400 mx-auto" />
                  ) : rank === 3 ? (
                    <Medal className="w-5 h-5 text-amber-700 mx-auto" />
                  ) : (
                    <span className="text-slate-600 font-mono">#{rank}</span>
                  )}
                </td>
                <td className="p-3 flex items-center gap-3 font-bold text-on-surface">
                  <img
                    src={p.user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.user?.name || 'User'}`}
                    alt="User"
                    className="w-7 h-7 rounded-full border border-slate-200"
                  />
                  <span>{p.user?.name || 'Anonymous Engineer'}</span>
                </td>
                <td className="p-3 text-right font-black text-primary font-mono text-sm">
                  {p.score || 0} pts
                </td>
                <td className="p-3 text-right font-mono text-slate-500">
                  {p.penalty || 0}s
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
