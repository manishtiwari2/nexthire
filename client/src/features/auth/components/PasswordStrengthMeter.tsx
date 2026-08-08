import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../../shared/lib/cn';
import { scorePassword } from '../schemas';

interface PasswordStrengthMeterProps {
  value: string;
  /** Hide the requirement checklist once every rule is satisfied. */
  collapseWhenValid?: boolean;
}

const SEGMENT_STYLES: Record<number, string> = {
  0: 'bg-outline',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

const LABEL_STYLES: Record<number, string> = {
  0: 'text-on-surface-muted',
  1: 'text-danger',
  2: 'text-warning',
  3: 'text-info',
  4: 'text-success',
};

/**
 * Four-segment strength bar plus a live requirement checklist.
 *
 * Advisory only — the schema decides what is accepted. The checklist is the part that
 * actually helps: it tells the user which rule is still unmet instead of making them guess
 * from a colour.
 */
export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  value,
  collapseWhenValid = true,
}) => {
  const { score, label, checks } = scorePassword(value);
  const allMet = checks.every((c) => c.met);

  if (!value) return null;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="presentation">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300',
                segment <= score ? SEGMENT_STYLES[score] : 'bg-surface-container-highest'
              )}
            />
          ))}
        </div>
        <span
          className={cn('w-16 text-right text-[11px] font-semibold tabular-nums', LABEL_STYLES[score])}
          // Announce changes without stealing focus.
          role="status"
          aria-live="polite"
        >
          {label}
        </span>
      </div>

      {!(collapseWhenValid && allMet) && (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                'flex items-center gap-1.5 text-[11px] transition-colors',
                check.met ? 'text-success' : 'text-on-surface-muted'
              )}
            >
              {check.met ? (
                <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
              ) : (
                <X className="h-3 w-3 shrink-0" aria-hidden />
              )}
              {check.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
