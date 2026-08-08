import React from 'react';
import { Link } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import { Card } from '../../../shared/components/ui';
import { cn } from '../../../shared/lib/cn';

interface AuthLayoutProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Rendered under the card (e.g. "Already have an account? Sign in"). */
  footer?: React.ReactNode;
  /** Icon shown in the brand badge. Defaults to the NextHire mark. */
  icon?: React.ReactNode;
  /** Widen the card for denser content such as the sign-up form. */
  width?: 'sm' | 'md';
  className?: string;
}

/**
 * Shared shell for every unauthenticated page: centred card on the grid background, brand
 * mark, heading, and a consistent footer slot. Having one of these is what makes login,
 * register, forgot, reset and verify feel like one product rather than five screens.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  children,
  footer,
  icon,
  width = 'sm',
  className,
}) => (
  <div className="relative flex min-h-screen items-center justify-center bg-background p-4 text-on-surface sm:p-6">
    <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
    {/* Soft accent glow behind the card — pure decoration. */}
    <div
      className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/10 blur-[120px]"
      aria-hidden
    />

    <div className={cn('relative w-full space-y-7', width === 'md' ? 'max-w-lg' : 'max-w-md', className)}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Link
          to="/"
          aria-label="NextHire home"
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-elev-2 transition-transform hover:scale-105"
        >
          {icon || <Terminal className="h-7 w-7" />}
        </Link>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h1>
          {subtitle && <p className="text-sm leading-relaxed text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>

      <Card className="p-6 sm:p-8">{children}</Card>

      {footer && <div className="text-center text-sm text-on-surface-variant">{footer}</div>}
    </div>
  </div>
);

/** The "or continue with" rule between the Google button and the email form. */
export const AuthDivider: React.FC<{ label?: string }> = ({ label = 'Or continue with email' }) => (
  <div className="relative flex items-center justify-center py-1">
    <div className="absolute inset-0 flex items-center" aria-hidden>
      <div className="w-full border-t border-outline-variant" />
    </div>
    <span className="relative bg-surface-container-lowest px-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-muted">
      {label}
    </span>
  </div>
);
