import React from 'react';
import { cn } from '../../lib/cn';

export interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  className?: string;
}

const accents: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success-container text-success',
  warning: 'bg-warning-container text-warning',
  danger: 'bg-error-container text-danger',
  info: 'bg-info-container text-info',
  accent: 'bg-tertiary-container text-tertiary',
};

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  hint,
  accent = 'primary',
  className,
}) => (
  <div
    className={cn(
      'rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elev-1 transition-colors hover:border-outline',
      className
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-on-surface">{value}</p>
        {hint && <p className="text-xs text-on-surface-muted">{hint}</p>}
      </div>
      {icon && (
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', accents[accent])}>
          {icon}
        </div>
      )}
    </div>
  </div>
);
