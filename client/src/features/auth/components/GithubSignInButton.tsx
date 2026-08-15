import React, { useCallback, useState } from 'react';
import { Button } from '../../../shared/components/ui';
import { githubAuthUrl } from '../api';
import type { AuthServerConfig } from '../types';

/**
 * Real GitHub sign-in.
 *
 * Only one path exists, unlike Google's two: GitHub is OAuth 2.0 and not OpenID Connect, so
 * there is no ID token a browser-side SDK could hand us and nothing this component could
 * usefully verify. It is a plain navigation to `/auth/github/start`; the server does the
 * code exchange, reads the profile from the GitHub API, checks that the email is verified,
 * sets the session cookies, and redirects back to `/auth/callback`.
 *
 * The browser therefore never touches a GitHub token, and nothing this component reports
 * about the user is trusted by the backend.
 */

const GithubIcon: React.FC = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
    {/* Single-colour mark: it inherits the button's text colour, which keeps it legible on
        the dark surface instead of vanishing the way GitHub's black-on-black logo would. */}
    <path
      fill="currentColor"
      d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.09 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.41-2.7 5.38-5.26 5.67.42.36.79 1.07.79 2.17v3.21c0 .3.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"
    />
  </svg>
);

interface GithubSignInButtonProps {
  config: AuthServerConfig | null;
  /** Where to land after the redirect. Relative paths only — the server re-checks this. */
  redirectTo?: string;
  rememberMe?: boolean;
  disabled?: boolean;
  label?: string;
}

export const GithubSignInButton: React.FC<GithubSignInButtonProps> = ({
  config,
  redirectTo = '/dashboard',
  rememberMe = false,
  disabled,
  label = 'Continue with GitHub',
}) => {
  const [isWorking, setIsWorking] = useState(false);

  const startCodeFlow = useCallback(() => {
    setIsWorking(true);
    // Full navigation, not fetch: the OAuth consent screen must be a top-level page.
    window.location.assign(githubAuthUrl(redirectTo, rememberMe));
  }, [redirectTo, rememberMe]);

  // Nothing configured — say so plainly rather than showing a button that cannot work.
  if (!config?.githubEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-3 text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-medium text-on-surface-variant">
          <GithubIcon /> GitHub sign-in is not configured
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-on-surface-muted">
          Set <code className="font-mono text-on-surface-variant">GITHUB_CLIENT_ID</code> and
          <code className="ml-1 font-mono text-on-surface-variant">GITHUB_CLIENT_SECRET</code> in{' '}
          <code className="font-mono text-on-surface-variant">server/.env</code> to enable it.
        </p>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      fullWidth
      onClick={startCodeFlow}
      isLoading={isWorking}
      disabled={disabled || isWorking}
      leftIcon={<GithubIcon />}
    >
      {isWorking ? 'Redirecting to GitHub…' : label}
    </Button>
  );
};
