import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { MailWarning } from 'lucide-react';

import { useAuthStore } from '../../store/useAuthStore';
import { PageLoader } from '../../shared/components/ui';
import type { Permission, Role } from '../../features/auth/types';

/**
 * Route guards.
 *
 * These are a *usability* layer, not a security boundary — the real enforcement is the
 * server rejecting the request. What they add is that an unauthorised user never sees a
 * half-rendered page that then explodes on a 403, and that being bounced to /login
 * remembers where they were headed.
 *
 * Guards wait on `status === 'bootstrapping'` rather than checking `user` directly: on a
 * hard reload the session is restored asynchronously via the refresh cookie, and redirecting
 * before that finishes would kick signed-in users to /login on every refresh.
 */

interface ProtectedRouteProps {
  /** Any one of these roles is sufficient. */
  roles?: Role[];
  /** Capability required, checked against the server-issued permission list. */
  permission?: Permission;
  /** Require a verified email address (defaults to true for authenticated routes). */
  requireVerified?: boolean;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  roles,
  permission,
  requireVerified = true,
  children,
}) => {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === 'bootstrapping' || status === 'idle') {
    return <PageLoader label="Restoring your session…" />;
  }

  if (status !== 'authenticated' || !user) {
    // Preserve the destination so signing in returns the user here.
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (requireVerified && !user.emailVerified) {
    return <Navigate to="/verify-email-required" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  if (permission && !user.permissions.includes(permission)) {
    return <Navigate to="/403" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

/**
 * For /login, /register and friends: an already-signed-in user should not see a sign-in
 * form. Sends them where they were headed, or to the dashboard.
 */
export const PublicOnlyRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const redirectAfterLogin = useAuthStore((state) => state.redirectAfterLogin);

  if (status === 'bootstrapping' || status === 'idle') {
    return <PageLoader label="Loading…" />;
  }

  if (status === 'authenticated') {
    const requested = (location.state as { from?: string } | null)?.from || redirectAfterLogin;
    const target = requested && /^\/[^/\\]/.test(requested) ? requested : '/dashboard';
    return <Navigate to={target} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

/**
 * Conditional rendering by capability, for inside a page — hiding an admin button rather
 * than guarding a whole route.
 */
export const Can: React.FC<{
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({ permission, fallback = null, children }) => {
  const can = useAuthStore((state) => state.can);
  return can(permission) ? <>{children}</> : <>{fallback}</>;
};

/**
 * Interstitial for a signed-in but unverified account. It is not a dead end: the user can
 * resend the link or sign out, which is what they will actually want to do.
 */
export const VerifyEmailRequiredPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');

  if (status === 'bootstrapping') return <PageLoader label="Loading…" />;
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/dashboard" replace />;

  const resend = async () => {
    setState('sending');
    const { resendVerification } = await import('../../features/auth/api');
    try {
      await resendVerification(user.email);
      setState('sent');
    } catch {
      setState('idle');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative w-full max-w-md space-y-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-elev-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <MailWarning className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-on-surface">Verify your email address</h1>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            We sent a verification link to <span className="font-semibold text-on-surface">{user.email}</span>. Confirm
            it to unlock practice, contests and progress tracking.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={resend}
            disabled={state !== 'idle'}
            className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-on-primary shadow-elev-1 transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Link sent — check your inbox' : 'Resend verification link'}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="h-11 rounded-xl border border-outline-variant px-6 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
