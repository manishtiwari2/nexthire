import React from 'react';
import { cn } from '../../lib/cn';

export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div
    className={cn('animate-shimmer rounded-md bg-surface-container-high', className)}
    style={{ animation: 'shimmer 1.6s ease-in-out infinite' }}
    {...props}
  />
);

/** A card-shaped skeleton placeholder for loading lists/grids. */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 space-y-4', className)}>
    <div className="flex items-center justify-between">
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
    <Skeleton className="h-6 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
    <div className="flex items-center justify-between pt-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-28 rounded-xl" />
    </div>
  </div>
);
