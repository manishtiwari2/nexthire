import React from 'react';
import { cn } from '../../../shared/lib/cn';

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  featured?: boolean;
}

/** A launchable practice-mode tile. */
export const PracticeModeCard: React.FC<Props> = ({ icon, title, description, badge, onClick, disabled, featured }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'group flex h-full flex-col items-start gap-3 rounded-2xl border p-5 text-left shadow-elev-1 transition-colors',
      featured
        ? 'border-primary/40 bg-primary/8 hover:border-primary'
        : 'border-outline-variant bg-surface-container-lowest hover:border-primary/40',
      disabled && 'cursor-not-allowed opacity-50'
    )}
  >
    <div className="flex w-full items-start justify-between gap-2">
      <span className={cn(
        'flex h-11 w-11 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5',
        featured ? 'bg-primary text-on-primary' : 'bg-primary/12 text-primary'
      )}>
        {icon}
      </span>
      {badge}
    </div>
    <div className="space-y-1">
      <h3 className="font-semibold text-on-surface group-hover:text-primary">{title}</h3>
      <p className="text-sm text-on-surface-variant">{description}</p>
    </div>
  </button>
);
