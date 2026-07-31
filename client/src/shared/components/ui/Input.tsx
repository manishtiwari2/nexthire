import React, { useId } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  containerClassName?: string;
}

export const fieldControlClasses =
  'w-full rounded-xl bg-surface-container-low border border-outline-variant text-on-surface ' +
  'placeholder:text-on-surface-muted transition-colors duration-150 outline-none ' +
  'hover:border-outline focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, className, containerClassName, id, required, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
      <div className={cn('w-full space-y-1.5 text-left', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-on-surface-variant">
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={!!error || undefined}
            className={cn(
              fieldControlClasses,
              'h-10 text-sm',
              icon ? 'pl-9 pr-3' : 'px-3',
              error && 'border-danger focus:border-danger focus:ring-danger/25',
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-xs font-medium text-danger">{error}</p>
        ) : hint ? (
          <p className="text-xs text-on-surface-muted">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
