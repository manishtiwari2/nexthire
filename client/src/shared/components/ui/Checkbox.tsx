import React, { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

/**
 * Checkbox matching the design system.
 *
 * The native input stays in the DOM (visually hidden, `peer`) rather than being replaced by
 * a div: keyboard behaviour, focus order, form participation and react-hook-form's
 * `register()` all keep working for free, and the visible box is drawn with `peer-checked`.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, hint, error, className, containerClassName, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;

    return (
      <div className={cn('space-y-1', containerClassName)}>
        <div className="flex items-start gap-2.5">
          <span className="relative flex h-5 items-center">
            <input
              ref={ref}
              id={inputId}
              type="checkbox"
              className={cn('peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-outline bg-surface-container-low outline-none transition-colors',
                'checked:border-primary checked:bg-primary',
                'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'disabled:cursor-not-allowed disabled:opacity-50',
                error && 'border-danger',
                className
              )}
              {...props}
            />
            <Check
              className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 scale-75 text-on-primary opacity-0 transition-opacity peer-checked:opacity-100"
              strokeWidth={3}
              aria-hidden
            />
          </span>
          {label && (
            <label htmlFor={inputId} className="cursor-pointer select-none text-sm leading-5 text-on-surface-variant">
              {label}
            </label>
          )}
        </div>
        {error ? (
          <p className="pl-[26px] text-xs font-medium text-danger">{error}</p>
        ) : hint ? (
          <p className="pl-[26px] text-xs text-on-surface-muted">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
