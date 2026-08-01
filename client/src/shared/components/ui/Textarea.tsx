import React, { useId } from 'react';
import { cn } from '../../lib/cn';
import { fieldControlClasses } from './Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  mono?: boolean;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, mono, className, containerClassName, id, required, ...props }, ref) => {
    const autoId = useId();
    const areaId = id || autoId;
    return (
      <div className={cn('w-full space-y-1.5 text-left', containerClassName)}>
        {label && (
          <label htmlFor={areaId} className="block text-xs font-semibold text-on-surface-variant">
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          required={required}
          aria-invalid={!!error || undefined}
          className={cn(
            fieldControlClasses,
            'px-3 py-2.5 text-sm leading-relaxed resize-y min-h-[80px]',
            mono && 'font-mono text-[13px]',
            error && 'border-danger focus:border-danger focus:ring-danger/25',
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs font-medium text-danger">{error}</p>
        ) : hint ? (
          <p className="text-xs text-on-surface-muted">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
