import React from 'react';
import { cn } from '../../lib/cn';

export interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/** Consistent page/section title block with optional icon chip and right-aligned actions. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  description,
  actions,
  className,
}) => (
  <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div className="flex items-start gap-3">
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-on-surface sm:text-2xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-on-surface-variant">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);
