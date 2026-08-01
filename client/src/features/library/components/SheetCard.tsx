import React from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, User, Sparkles } from 'lucide-react';
import { Badge } from '../../../shared/components/ui';
import type { SheetSummary } from '../types';

/** A progress bar rendering solved / total for a study sheet. */
export const SheetProgressBar: React.FC<{ solved: number; total: number }> = ({ solved, total }) => {
  const pct = total ? Math.round((solved / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-on-surface-variant">{solved} / {total} solved</span>
        <span className="font-semibold text-primary">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const SheetCard: React.FC<{ sheet: SheetSummary }> = ({ sheet }) => (
  <Link
    to={`/sheets/${sheet.slug}`}
    className="group flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elev-1 transition-colors hover:border-primary/40"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <ListChecks className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold text-on-surface group-hover:text-primary">{sheet.name}</h3>
          <p className="text-xs text-on-surface-muted">{sheet.total} problems</p>
        </div>
      </div>
      <Badge variant={sheet.kind === 'SYSTEM' ? 'primary' : 'accent'}>
        {sheet.kind === 'SYSTEM' ? <><Sparkles className="h-3 w-3" /> Curated</> : <><User className="h-3 w-3" /> Yours</>}
      </Badge>
    </div>
    {sheet.description && <p className="line-clamp-2 text-sm text-on-surface-variant">{sheet.description}</p>}
    <SheetProgressBar solved={sheet.solvedCount} total={sheet.total} />
  </Link>
);
