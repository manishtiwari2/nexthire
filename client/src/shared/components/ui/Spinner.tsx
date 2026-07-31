import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className, label }) => (
  <span role="status" className={cn('inline-flex items-center gap-2 text-on-surface-variant', className)}>
    <Loader2 className={cn('animate-spin text-primary', sizeMap[size])} />
    {label && <span className="text-sm">{label}</span>}
    <span className="sr-only">Loading</span>
  </span>
);

/** Full-viewport centered spinner for route/page suspense fallbacks. */
export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex min-h-screen w-full items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-on-surface-variant">{label}</p>
    </div>
  </div>
);
