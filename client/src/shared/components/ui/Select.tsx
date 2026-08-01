import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fieldControlClasses } from './Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className, containerClassName, id, required, children, ...props }, ref) => {
    const autoId = useId();
    const selectId = id || autoId;
    return (
      <div className={cn('w-full space-y-1.5 text-left', containerClassName)}>
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-on-surface-variant">
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={!!error || undefined}
            className={cn(
              fieldControlClasses,
              'h-10 pl-3 pr-9 text-sm appearance-none cursor-pointer',
              '[&>option]:bg-surface-container [&>option]:text-on-surface',
              error && 'border-danger focus:border-danger focus:ring-danger/25',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-muted" />
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

Select.displayName = 'Select';
