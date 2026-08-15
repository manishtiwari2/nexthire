import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { AuthLayout } from '../features/auth/components/AuthLayout';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { Button, Spinner } from '../shared/components/ui';

/**
 * Landing point for every OAuth authorization-code flow (Google, GitHub).
 *
 * The server has already verified the identity, created the session, and set the HTTP-only
 * refresh cookie. It hands the short-lived access token back in the URL *fragment* rather
 * than the query string, because fragments are never sent to servers and so never appear in
 * access logs, proxy logs, or `Referer` headers.
 *
 * This page reads the fragment, adopts the token, wipes the fragment from history so it
 * cannot be recovered from the back button, and continues into the app.
 */

/** Display names for the `provider` the server echoes back in the fragment. */
const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE: 'Google',
  GITHUB: 'GitHub',
};

export const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { adoptTokens, setRedirectAfterLogin } = useAuthStore();
  const { addToast } = useNotificationStore();

  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  // Read in a state initialiser, not the effect: the effect wipes the fragment, and this
  // has to survive to name the provider in the copy below.
  const [providerLabel] = useState<string | null>(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return PROVIDER_LABELS[fragment.get('provider') || ''] ?? null;
  });
  const providerName = providerLabel ?? 'OAuth';

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = fragment.get('access_token');
    const expiresIn = Number(fragment.get('expires_in')) || 900;
    const redirect = fragment.get('redirect') || '/dashboard';
    const isNewAccount = fragment.get('new_account') === '1';

    // Remove the token from the URL and from the history entry immediately.
    window.history.replaceState(null, '', window.location.pathname);

    if (!accessToken) {
      setError(`${providerName} sign-in did not return a session. Please try again.`);
      return;
    }

    (async () => {
      try {
        const user = await adoptTokens(accessToken, expiresIn);
        setRedirectAfterLogin(null);
        addToast(
          isNewAccount ? 'Welcome to NextHire' : 'Welcome back',
          `Signed in as ${user.name}`,
          'success'
        );
        // Only relative paths — the redirect came through a URL and must not be trusted to
        // send the user off-site.
        const safeRedirect = /^\/[^/\\]/.test(redirect) ? redirect : '/dashboard';
        navigate(safeRedirect, { replace: true });
      } catch {
        setError('Could not complete sign-in. Please try again.');
      }
    })();
  }, [adoptTokens, addToast, navigate, providerName, setRedirectAfterLogin]);

  if (error) {
    return (
      <AuthLayout title="Sign-in failed" subtitle={error} icon={<ShieldAlert className="h-7 w-7" />}>
        <Button type="button" size="lg" fullWidth onClick={() => navigate('/login', { replace: true })}>
          Back to sign in
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Signing you in"
      subtitle={providerLabel ? `Completing your ${providerLabel} sign-in…` : 'Completing your sign-in…'}
    >
      <div className="flex flex-col items-center gap-4 py-6">
        <Spinner size="lg" />
        <p className="text-sm text-on-surface-variant">Establishing your session…</p>
      </div>
    </AuthLayout>
  );
};
