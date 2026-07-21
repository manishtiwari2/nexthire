import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { Calendar, RotateCcw, CheckCircle2, Sparkles } from 'lucide-react';

interface RevisionScheduleCardProps {
  questionId: string;
}

export const RevisionScheduleCard: React.FC<RevisionScheduleCardProps> = ({ questionId }) => {
  const [successMsg, setSuccessMsg] = useState('');
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: (quality: number) => apiClient.post('/revision/review', { questionId, quality }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['due-revisions'] });
      const nextDate = new Date(res.data.nextReviewAt).toLocaleDateString();
      setSuccessMsg(`Revision scheduled! Next review due on ${nextDate}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  });

  return (
    <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-3 text-xs text-purple-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-sm">
          <RotateCcw className="w-4 h-4 text-purple-700" /> Spaced Repetition (SM-2 Revision)
        </div>
        <span className="text-[10px] font-bold bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Auto Scheduled
        </span>
      </div>

      <p className="text-[11px] text-purple-800 leading-relaxed">
        Rate your solving confidence to automatically schedule your next review interval according to the SM-2 spaced repetition algorithm.
      </p>

      {successMsg && (
        <div className="p-2.5 bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold rounded-xl flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" /> {successMsg}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 pt-1">
        <button
          onClick={() => reviewMutation.mutate(2)}
          disabled={reviewMutation.isPending}
          className="p-2 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-xl text-center text-[10px] transition-all"
        >
          Hard (1d)
        </button>
        <button
          onClick={() => reviewMutation.mutate(3)}
          disabled={reviewMutation.isPending}
          className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-xl text-center text-[10px] transition-all"
        >
          Good (3d)
        </button>
        <button
          onClick={() => reviewMutation.mutate(4)}
          disabled={reviewMutation.isPending}
          className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold rounded-xl text-center text-[10px] transition-all"
        >
          Easy (6d)
        </button>
        <button
          onClick={() => reviewMutation.mutate(5)}
          disabled={reviewMutation.isPending}
          className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-xl text-center text-[10px] transition-all"
        >
          Perfect (14d)
        </button>
      </div>
    </div>
  );
};
