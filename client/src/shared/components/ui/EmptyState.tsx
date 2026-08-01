import React from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest/50 px-6 py-14 text-center',
      className
    )}
  >
    {icon && (
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </div>
    )}
    <h3 className="text-base font-semibold text-on-surface">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-on-surface-variant">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
