import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Badge, Alert } from '../../../shared/components/ui';
import { cn } from '../../../shared/lib/cn';

interface RevisionScheduleCardProps {
  questionId: string;
}

const RATINGS = [
  { quality: 2, label: 'Hard', interval: '1d', cls: 'border-danger/30 bg-error-container/50 text-danger hover:bg-error-container' },
  { quality: 3, label: 'Good', interval: '3d', cls: 'border-warning/30 bg-warning-container/50 text-warning hover:bg-warning-container' },
  { quality: 4, label: 'Easy', interval: '6d', cls: 'border-info/30 bg-info-container/50 text-info hover:bg-info-container' },
  { quality: 5, label: 'Perfect', interval: '14d', cls: 'border-success/30 bg-success-container/50 text-success hover:bg-success-container' },
];

export const RevisionScheduleCard: React.FC<RevisionScheduleCardProps> = ({ questionId }) => {
  const [successMsg, setSuccessMsg] = useState('');
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: (quality: number) => apiClient.post('/revision/review', { questionId, quality }),
    onSuccess: (res: any) => {
      ['due-revisions', 'revision', 'revision-queue', 'progress-stats'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      const nextDate = new Date(res.data.nextReviewAt).toLocaleDateString();
      setSuccessMsg(`Revision scheduled! Next review due on ${nextDate}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    },
  });

  return (
    <div className="space-y-4 rounded-xl border border-tertiary/25 bg-tertiary-container/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <RotateCcw className="h-4 w-4 text-tertiary" /> Spaced Repetition (SM-2)
        </h3>
        <Badge variant="accent">
          <Sparkles className="h-3 w-3" /> Auto Scheduled
        </Badge>
      </div>

      <p className="text-xs leading-relaxed text-on-surface-variant">
        Rate your solving confidence to automatically schedule your next review interval using the SM-2 spaced
        repetition algorithm.
      </p>

      {successMsg && <Alert variant="success">{successMsg}</Alert>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RATINGS.map((r) => (
          <button
            key={r.quality}
            onClick={() => reviewMutation.mutate(r.quality)}
            disabled={reviewMutation.isPending}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50',
              r.cls
            )}
          >
            <span>{r.label}</span>
            <span className="font-mono text-[10px] opacity-70">{r.interval}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
