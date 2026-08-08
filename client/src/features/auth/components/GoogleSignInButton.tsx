import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui';
import { googleAuthUrl } from '../api';
import type { AuthServerConfig } from '../types';

/**
 * Real Google sign-in, with two paths chosen by what the server is configured for:
 *
 *  1. **Authorization-code flow** (preferred, needs GOOGLE_CLIENT_SECRET on the server).
 *     A plain navigation to `/auth/google/start`. The browser never handles a token; the
 *     server does the code exchange, verifies the ID token, sets the session cookies and
 *     redirects back to `/auth/callback`.
 *
 *  2. **Google Identity Services** (needs only GOOGLE_CLIENT_ID). Loads Google's script and
 *     renders their official button; the resulting ID token is POSTed to `/auth/google`,
 *     where the server verifies it against Google's public keys.
 *
 * Either way the credential is verified server-side. Nothing this component reports about
 * the user is trusted by the backend.
 */

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: (callback?: (notification: unknown) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisLoader: Promise<boolean> | null = null;

/** Load Google's script once per page, shared across every mount. */
function loadGis(): Promise<boolean> {
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.accounts?.id)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.google?.accounts?.id));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return gisLoader;
}

const GoogleIcon: React.FC = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

interface GoogleSignInButtonProps {
  config: AuthServerConfig | null;
  /** Called with the GIS credential (ID token). Only used in the GIS path. */
  onCredential: (credential: string) => Promise<void> | void;
  /** Where to land after the code-flow redirect. */
  redirectTo?: string;
  rememberMe?: boolean;
  disabled?: boolean;
  label?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  config,
  onCredential,
  redirectTo = '/dashboard',
  rememberMe = false,
  disabled,
  label = 'Continue with Google',
}) => {
  const gisContainerRef = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Keep the latest callback in a ref: GIS captures the callback at initialize() time, so
  // closing over a stale one would send credentials to an old handler.
  const credentialHandler = useRef(onCredential);
  credentialHandler.current = onCredential;

  const useCodeFlow = Boolean(config?.googleCodeFlowEnabled);
  const useGis = Boolean(config?.googleEnabled && config.googleClientId && !useCodeFlow);

  useEffect(() => {
    if (!useGis || !config?.googleClientId) return;
    let cancelled = false;

    loadGis().then((loaded) => {
      if (cancelled) return;
      if (!loaded || !window.google?.accounts?.id) {
        setLoadFailed(true);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async (response: { credential?: string }) => {
          if (!response?.credential) return;
          setIsWorking(true);
          try {
            await credentialHandler.current(response.credential);
          } finally {
            if (!cancelled) setIsWorking(false);
          }
        },
        // One Tap is disabled: an unexpected auto sign-in on a shared machine is worse
        // than one extra click.
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: 'popup',
      });

      if (gisContainerRef.current) {
        gisContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(gisContainerRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: gisContainerRef.current.offsetWidth || 360,
        });
      }
      setGisReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [useGis, config?.googleClientId]);

  const startCodeFlow = useCallback(() => {
    setIsWorking(true);
    // Full navigation, not fetch: the OAuth consent screen must be a top-level page.
    window.location.assign(googleAuthUrl(redirectTo, rememberMe));
  }, [redirectTo, rememberMe]);

  // Nothing configured — say so plainly rather than showing a button that cannot work.
  if (!config?.googleEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-3 text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-medium text-on-surface-variant">
          <GoogleIcon /> Google sign-in is not configured
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-on-surface-muted">
          Set <code className="font-mono text-on-surface-variant">GOOGLE_CLIENT_ID</code> (and
          <code className="ml-1 font-mono text-on-surface-variant">GOOGLE_CLIENT_SECRET</code>) in{' '}
          <code className="font-mono text-on-surface-variant">.env</code> to enable it.
        </p>
      </div>
    );
  }

  if (useCodeFlow) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="lg"
        fullWidth
        onClick={startCodeFlow}
        isLoading={isWorking}
        disabled={disabled || isWorking}
        leftIcon={<GoogleIcon />}
      >
        {isWorking ? 'Redirecting to Google…' : label}
      </Button>
    );
  }

  // GIS path: Google's own button, with a skeleton while the script loads.
  return (
    <div className="space-y-2">
      <div
        ref={gisContainerRef}
        className={gisReady ? 'flex justify-center [&>div]:!w-full' : 'hidden'}
        aria-busy={isWorking || undefined}
      />
      {!gisReady && !loadFailed && (
        <div className="flex h-11 w-full animate-shimmer items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-high text-xs font-medium text-on-surface-muted">
          <GoogleIcon /> Loading Google sign-in…
        </div>
      )}
      {loadFailed && (
        <p className="text-center text-xs text-warning">
          Google sign-in could not load. Check your connection or use email and password.
        </p>
      )}
    </div>
  );
};
