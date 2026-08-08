import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailWarning, ShieldAlert } from 'lucide-react';

import { AuthLayout } from '../features/auth/components/AuthLayout';
import { resendVerification, verifyEmail } from '../features/auth/api';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { isApiError } from '../api/client';
import { Alert, Button, Input, Spinner } from '../shared/components/ui';

type Phase = 'verifying' | 'success' | 'already' | 'failed';

/**
 * Email verification landing page.
 *
 * Verifies on mount — the user clicked a link, so making them click a second button would
 * be pointless friction. React 18 StrictMode double-invokes effects in development, so the
 * request is guarded by a ref: without it the second call consumes the (now single-use)
 * token and reports failure for a verification that actually succeeded.
 */
export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useNotificationStore();
  const { isAuthenticated, refreshUser } = useAuthStore();

  const token = searchParams.get('token');
  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState<string>(
    token ? '' : 'This verification link is missing its token.'
  );
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const result = await verifyEmail(token);
        setMessage(result.message);
        setPhase(result.alreadyVerified ? 'already' : 'success');
        // If this tab is signed in, the `emailVerified` flag it holds is now stale.
        if (isAuthenticated()) await refreshUser();
      } catch (error) {
        setPhase('failed');
        setMessage(
          isApiError(error)
            ? error.message
            : 'This verification link could not be used. Request a new one.'
        );
      }
    })();
  }, [token, isAuthenticated, refreshUser]);

  const handleResend = async () => {
    if (!resendEmail) return;
    setResendState('sending');
    try {
      const result = await resendVerification(resendEmail);
      setResendState('sent');
      addToast('Verification link sent', result.message, 'success');
    } catch (error) {
      setResendState('idle');
      addToast('Could not resend', isApiError(error) ? error.message : 'Please try again shortly.', 'error');
    }
  };

  if (phase === 'verifying') {
    return (
      <AuthLayout title="Verifying your email" subtitle="This will only take a moment.">
        <div className="flex flex-col items-center gap-4 py-6">
          <Spinner size="lg" />
          <p className="text-sm text-on-surface-variant">Confirming your verification link…</p>
        </div>
      </AuthLayout>
    );
  }

  if (phase === 'success' || phase === 'already') {
    return (
      <AuthLayout
        title={phase === 'success' ? 'Email verified' : 'Already verified'}
        subtitle={message}
        icon={<CheckCircle2 className="h-7 w-7" />}
      >
        <div className="space-y-3">
          <Button
            type="button"
            size="lg"
            fullWidth
            onClick={() => navigate(isAuthenticated() ? '/dashboard' : '/login', { replace: true })}
          >
            {isAuthenticated() ? 'Go to dashboard' : 'Sign in to NextHire'}
          </Button>
          {!isAuthenticated() && (
            <p className="text-center text-xs text-on-surface-muted">
              Your account is active. Sign in with the email and password you registered with.
            </p>
          )}
        </div>
      </AuthLayout>
    );
  }

  // ---- Failed ----
  return (
    <AuthLayout
      title="Verification failed"
      subtitle="This link may have expired or already been used. Request a fresh one below."
      icon={<ShieldAlert className="h-7 w-7" />}
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        <Alert variant="danger" icon={<MailWarning className="h-4 w-4" />}>
          {message}
        </Alert>

        <div className="space-y-3 border-t border-outline-variant pt-4">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            hint="We will send a new verification link to this address."
            value={resendEmail}
            onChange={(event) => {
              setResendEmail(event.target.value);
              setResendState('idle');
            }}
          />
          <Button
            type="button"
            size="lg"
            fullWidth
            onClick={handleResend}
            isLoading={resendState === 'sending'}
            disabled={!resendEmail || resendState !== 'idle'}
          >
            {resendState === 'sent' ? 'Link sent — check your inbox' : 'Send a new link'}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
};
