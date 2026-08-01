import React from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
  primary: 'bg-primary/12 text-primary border-primary/20',
  success: 'bg-success-container text-on-success-container border-success/25',
  warning: 'bg-warning-container text-on-warning-container border-warning/25',
  danger: 'bg-error-container text-on-error-container border-error/25',
  info: 'bg-info-container text-on-info-container border-info/25',
  accent: 'bg-tertiary-container text-on-tertiary-container border-tertiary/25',
  outline: 'bg-transparent text-on-surface-variant border-outline',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-on-surface-variant',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-tertiary',
  outline: 'bg-on-surface-variant',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  dot,
  pulse,
  className,
  children,
  ...props
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
      variants[variant],
      className
    )}
    {...props}
  >
    {dot && (
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dotColors[variant])} />
        )}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotColors[variant])} />
      </span>
    )}
    {children}
  </span>
);

/** Maps a question difficulty to a consistent badge. */
export const DifficultyBadge: React.FC<{ difficulty?: string; className?: string }> = ({
  difficulty,
  className,
}) => {
  const d = (difficulty || '').toUpperCase();
  const variant: BadgeVariant = d === 'EASY' ? 'success' : d === 'MEDIUM' ? 'warning' : d === 'HARD' ? 'danger' : 'default';
  return (
    <Badge variant={variant} className={className}>
      {d ? d.charAt(0) + d.slice(1).toLowerCase() : 'Unknown'}
    </Badge>
  );
};
