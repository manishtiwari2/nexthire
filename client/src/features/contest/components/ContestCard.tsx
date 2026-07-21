import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Clock, Users, ArrowRight } from 'lucide-react';

interface ContestCardProps {
  contest: any;
  onJoin?: (id: string) => void;
}

export const ContestCard: React.FC<ContestCardProps> = ({ contest, onJoin }) => {
  const isLive = contest.status === 'LIVE';
  const isEnded = contest.status === 'ENDED';

  return (
    <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm space-y-4 hover:border-primary/40 transition-all">
      <div className="flex items-center justify-between">
        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
          isLive ? 'bg-red-100 text-red-700 animate-pulse' :
          isEnded ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
        }`}>
          {contest.status}
        </span>

        <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-primary" /> {contest._count?.participants || 0} Registered
        </span>
      </div>

      <div>
        <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary shrink-0" /> {contest.title}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{contest.description}</p>
      </div>

      <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs">
        <span className="text-slate-500 font-mono flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> Start: {new Date(contest.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>

        <div className="flex gap-2">
          <Link
            to={`/contest/${contest.id}`}
            className="px-4 py-2 bg-primary text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm"
          >
            <span>{isLive ? 'Enter Contest IDE' : 'View Session'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
