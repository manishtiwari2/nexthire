import React from 'react';
import { Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: React.ReactNode;
}

const styles: Record<AlertVariant, { wrap: string; icon: string; Icon: React.ElementType }> = {
  info: { wrap: 'bg-info-container/60 border-info/25 text-on-info-container', icon: 'text-info', Icon: Info },
  success: { wrap: 'bg-success-container/60 border-success/25 text-on-success-container', icon: 'text-success', Icon: CheckCircle2 },
  warning: { wrap: 'bg-warning-container/60 border-warning/25 text-on-warning-container', icon: 'text-warning', Icon: AlertTriangle },
  danger: { wrap: 'bg-error-container/60 border-error/25 text-on-error-container', icon: 'text-danger', Icon: AlertCircle },
};

export const Alert: React.FC<AlertProps> = ({ variant = 'info', title, icon, className, children, ...props }) => {
  const s = styles[variant];
  const Icon = s.Icon;
  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-xl border p-4 text-sm', s.wrap, className)}
      {...props}
    >
      <span className={cn('mt-0.5 shrink-0', s.icon)}>{icon || <Icon className="h-4 w-4" />}</span>
      <div className="space-y-0.5">
        {title && <p className="font-semibold text-on-surface">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
};
