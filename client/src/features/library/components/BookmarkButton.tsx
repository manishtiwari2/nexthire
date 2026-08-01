import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { cn } from '../../../shared/lib/cn';
import { toggleBookmark } from '../api';

interface Props {
  questionId: string;
  bookmarked?: boolean;
  /** Query keys to invalidate after toggling so lists refresh. */
  invalidate?: unknown[][];
  className?: string;
}

/** Toggle a question's bookmark. Optimistic-ish: relies on query invalidation to reconcile. */
export const BookmarkButton: React.FC<Props> = ({ questionId, bookmarked, invalidate = [], className }) => {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => toggleBookmark(questionId, !bookmarked),
    onSuccess: () => invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }))
  });

  return (
    <button
      type="button"
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark question'}
      title={bookmarked ? 'Bookmarked' : 'Bookmark'}
      disabled={mutation.isPending}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); mutation.mutate(); }}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        bookmarked ? 'text-warning hover:bg-warning-container' : 'text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface',
        className
      )}
    >
      <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
    </button>
  );
};
