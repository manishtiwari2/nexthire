import React, { useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { cn } from '../../../shared/lib/cn';
import { fieldControlClasses } from '../../../shared/components/ui';

export interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
  /** Rendered under the field (the strength meter on sign-up). */
  footer?: React.ReactNode;
  /** Link rendered on the right of the label, e.g. "Forgot password?". */
  labelAction?: React.ReactNode;
  showToggle?: boolean;
  containerClassName?: string;
}

/**
 * Password input with a visibility toggle.
 *
 * `forwardRef` matters: react-hook-form's `register()` returns a ref that must reach the
 * real `<input>`, otherwise the field is invisible to validation.
 */
export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  (
    { label, error, hint, footer, labelAction, showToggle = true, className, containerClassName, id, required, ...props },
    ref
  ) => {
    const autoId = useId();
    const inputId = id || autoId;
    const [visible, setVisible] = useState(false);

    return (
      <div className={cn('w-full space-y-1.5 text-left', containerClassName)}>
        {(label || labelAction) && (
          <div className="flex items-baseline justify-between gap-2">
            {label && (
              <label htmlFor={inputId} className="block text-xs font-semibold text-on-surface-variant">
                {label}
                {required && <span className="ml-0.5 text-danger">*</span>}
              </label>
            )}
            {labelAction}
          </div>
        )}

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted">
            <Lock className="h-4 w-4" />
          </span>

          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            required={required}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={cn(
              fieldControlClasses,
              'h-10 pl-9 text-sm',
              showToggle ? 'pr-10' : 'pr-3',
              error && 'border-danger focus:border-danger focus:ring-danger/25',
              className
            )}
            {...props}
          />

          {showToggle && (
            <button
              type="button"
              // Not a form control: keep it out of the tab order's way of submitting, but
              // still reachable — screen readers get the state from aria-pressed.
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-on-surface-muted transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>

        {error ? (
          <p id={`${inputId}-error`} className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : hint ? (
          <p className="text-xs text-on-surface-muted">{hint}</p>
        ) : null}

        {footer}
      </div>
    );
  }
);

PasswordField.displayName = 'PasswordField';
