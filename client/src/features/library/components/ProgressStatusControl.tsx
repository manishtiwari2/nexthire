import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Circle } from 'lucide-react';
import { cn } from '../../../shared/lib/cn';
import { setProgressStatus } from '../api';
import type { ProgressStatus } from '../types';

const OPTS: Array<{ value: ProgressStatus; label: string; icon: React.ReactNode; active: string }> = [
  { value: 'TODO', label: 'To do', icon: <Circle className="h-3.5 w-3.5" />, active: 'bg-surface-container-high text-on-surface' },
  { value: 'ATTEMPTED', label: 'Attempted', icon: <CircleDashed className="h-3.5 w-3.5" />, active: 'bg-warning-container text-on-warning-container' },
  { value: 'SOLVED', label: 'Solved', icon: <CheckCircle2 className="h-3.5 w-3.5" />, active: 'bg-success-container text-on-success-container' }
];

interface Props {
  questionId: string;
  status?: ProgressStatus;
  invalidate?: unknown[][];
}

/** Segmented control to set a question's personal status. */
export const ProgressStatusControl: React.FC<Props> = ({ questionId, status = 'TODO', invalidate = [] }) => {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: ProgressStatus) => setProgressStatus(questionId, next),
    onSuccess: () => invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }))
  });

  return (
    <div className="inline-flex rounded-xl border border-outline-variant bg-surface-container-lowest p-1">
      {OPTS.map((o) => {
        const isActive = status === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
              isActive ? o.active : 'text-on-surface-muted hover:text-on-surface'
            )}
          >
            {o.icon} {o.label}
          </button>
        );
      })}
    </div>
  );
};
