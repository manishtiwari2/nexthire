import React from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../shared/lib/cn';

const config = {
  success: { Icon: CheckCircle2, ring: 'text-success', chip: 'bg-success-container text-success' },
  warning: { Icon: AlertTriangle, ring: 'text-warning', chip: 'bg-warning-container text-warning' },
  error: { Icon: AlertCircle, ring: 'text-danger', chip: 'bg-error-container text-danger' },
  info: { Icon: Info, ring: 'text-info', chip: 'bg-info-container text-info' },
} as const;

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotificationStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const { Icon, chip } = config[(toast.type as keyof typeof config)] || config.info;
        return (
          <div
            key={toast.id}
            role="status"
            className="animate-slide-in pointer-events-auto flex items-start gap-3 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high p-4 shadow-elev-3"
          >
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', chip)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h4 className="text-sm font-semibold text-on-surface">{toast.title}</h4>
              {toast.message && <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-lg p-1 text-on-surface-muted transition-colors hover:bg-surface-container-highest hover:text-on-surface"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
