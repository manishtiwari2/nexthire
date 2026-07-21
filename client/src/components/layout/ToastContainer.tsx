import React from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotificationStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white border border-outline-variant shadow-xl rounded-2xl p-4 flex items-center gap-4 w-96 animate-slide-in relative overflow-hidden"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                isSuccess
                  ? 'bg-emerald-100 text-emerald-700'
                  : isWarning
                  ? 'bg-amber-100 text-amber-700'
                  : isError
                  ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {isSuccess && <CheckCircle2 className="w-5 h-5" />}
              {isWarning && <AlertTriangle className="w-5 h-5" />}
              {isError && <AlertCircle className="w-5 h-5" />}
              {!isSuccess && !isWarning && !isError && <Info className="w-5 h-5" />}
            </div>

            <div className="flex-1">
              <h4 className="font-bold text-sm text-on-surface">{toast.title}</h4>
              <p className="text-xs text-on-surface-variant leading-snug">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
