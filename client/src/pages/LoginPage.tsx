import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Mail, MailWarning, ShieldAlert } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { AuthDivider, AuthLayout } from '../features/auth/components/AuthLayout';
import { GoogleSignInButton } from '../features/auth/components/GoogleSignInButton';
import { GithubSignInButton } from '../features/auth/components/GithubSignInButton';
import { PasswordField } from '../features/auth/components/PasswordField';
import { loginSchema, type LoginInput } from '../features/auth/schemas';
import { resendVerification } from '../features/auth/api';
import { isApiError, type ApiError } from '../api/client';
import { Alert, Button, Checkbox, Input } from '../shared/components/ui';

/**
 * Sign-in page.
 *
 * Beyond the happy path it has to handle four distinct server refusals, each with a
 * different next step for the user: unverified email (resend the link), locked account
 * (wait), disabled account (contact an admin), and bad credentials (try again). Collapsing
 * them into one "login failed" message is what makes an auth flow feel broken.
 */
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { addToast } = useNotificationStore();

  const { login, loginWithGoogleCredential, loadServerConfig, serverConfig, isSubmitting, redirectAfterLogin, setRedirectAfterLogin } =
    useAuthStore();

  /** Server refusals that need their own UI, not just a field error. */
  const [blocker, setBlocker] = useState<ApiError | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [devLink, setDevLink] = useState<string | null>(null);

  // Where to go after signing in: an explicit ?next=, the route the guard bounced us from,
  // or the dashboard. Only relative paths are honoured, so ?next=https://evil.example
  // cannot turn this page into an open redirect.
  const requestedNext =
    (location.state as { from?: string } | null)?.from || searchParams.get('next') || redirectAfterLogin;
  const nextPath = requestedNext && /^\/[^/\\]/.test(requestedNext) ? requestedNext : '/dashboard';

  const {
    register: registerField,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const rememberMe = watch('rememberMe');
  const emailValue = watch('email');

  useEffect(() => {
    void loadServerConfig();
  }, [loadServerConfig]);

  // The Google authorization-code callback redirects here with ?error=… when it fails.
  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (!errorCode) return;
    const description = searchParams.get('error_description');
    setBlocker({
      code: errorCode,
      message: description || 'Google sign-in could not be completed.',
      status: 400,
    });
  }, [searchParams]);

  const finishLogin = (name: string) => {
    setRedirectAfterLogin(null);
    addToast('Welcome back', `Signed in as ${name}`, 'success');
    navigate(nextPath, { replace: true });
  };

  const applyServerError = (error: unknown) => {
    if (!isApiError(error)) {
      setBlocker({ code: 'UNKNOWN', message: 'Something went wrong. Please try again.', status: 0 });
      return;
    }

    // 422 with per-field messages maps straight onto the form.
    if (error.fields) {
      for (const [field, message] of Object.entries(error.fields)) {
        setError(field as keyof LoginInput, { type: 'server', message });
      }
      return;
    }

    switch (error.code) {
      case 'EMAIL_NOT_VERIFIED':
      case 'ACCOUNT_LOCKED':
      case 'ACCOUNT_DISABLED':
      case 'RATE_LIMITED':
      case 'PASSWORD_NOT_SET':
        setBlocker(error);
        break;
      case 'INVALID_CREDENTIALS':
        // Attach to the password field — that is where the user's attention already is.
        setError('password', { type: 'server', message: error.message });
        break;
      default:
        setBlocker(error);
    }
  };

  const onSubmit = async (values: LoginInput) => {
    setBlocker(null);
    setResendState('idle');
    try {
      const user = await login(values);
      finishLogin(user.name);
    } catch (error) {
      applyServerError(error);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setBlocker(null);
    try {
      const user = await loginWithGoogleCredential({ credential, rememberMe: Boolean(rememberMe) });
      finishLogin(user.name);
    } catch (error) {
      applyServerError(error);
    }
  };

  const handleResendVerification = async () => {
    const email = blocker?.extra?.email || emailValue;
    if (typeof email !== 'string' || !email) return;
    setResendState('sending');
    try {
      const result = await resendVerification(email);
      setResendState('sent');
      if (result.devVerificationUrl) setDevLink(result.devVerificationUrl);
      addToast('Verification link sent', result.message, 'success');
    } catch (error) {
      setResendState('idle');
      addToast('Could not resend', isApiError(error) ? error.message : 'Please try again shortly.', 'error');
    }
  };

  return (
    <AuthLayout
      title="Sign in to NextHire"
      subtitle="Practise DSA, track your progress, and compete in live assessments."
      footer={
        <>
          New to NextHire?{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {blocker && (
          <Alert
            variant={blocker.code === 'EMAIL_NOT_VERIFIED' ? 'warning' : 'danger'}
            title={
              blocker.code === 'EMAIL_NOT_VERIFIED'
                ? 'Verify your email to continue'
                : blocker.code === 'ACCOUNT_LOCKED'
                  ? 'Account temporarily locked'
                  : blocker.code === 'ACCOUNT_DISABLED'
                    ? 'Account disabled'
                    : 'Could not sign in'
            }
            icon={blocker.code === 'EMAIL_NOT_VERIFIED' ? <MailWarning className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          >
            <p>{blocker.message}</p>

            {blocker.code === 'EMAIL_NOT_VERIFIED' && (
              <div className="mt-2.5 space-y-2">
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  onClick={handleResendVerification}
                  isLoading={resendState === 'sending'}
                  disabled={resendState !== 'idle'}
                >
                  {resendState === 'sent' ? 'Link sent — check your inbox' : 'Resend verification link'}
                </Button>
                {devLink && (
                  <p className="text-[11px] leading-relaxed">
                    Development mode:{' '}
                    <Link to={devLink.replace(window.location.origin, '')} className="font-semibold text-primary hover:underline">
                      open the verification link
                    </Link>
                  </p>
                )}
              </div>
            )}
          </Alert>
        )}

        <div className="space-y-3">
          <GoogleSignInButton
            config={serverConfig}
            onCredential={handleGoogleCredential}
            redirectTo={nextPath}
            rememberMe={Boolean(rememberMe)}
            disabled={isSubmitting}
          />

          <GithubSignInButton
            config={serverConfig}
            redirectTo={nextPath}
            rememberMe={Boolean(rememberMe)}
            disabled={isSubmitting}
          />
        </div>

        <AuthDivider />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            required
            icon={<Mail className="h-4 w-4" />}
            placeholder="you@example.com"
            error={errors.email?.message}
            {...registerField('email')}
          />

          <PasswordField
            label="Password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            error={errors.password?.message}
            labelAction={
              <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                Forgot password?
              </Link>
            }
            {...registerField('password')}
          />

          <Checkbox
            label="Keep me signed in for 30 days"
            hint="Only use this on a device you trust."
            checked={Boolean(rememberMe)}
            onChange={(event) => setValue('rememberMe', event.target.checked)}
          />

          <Button
            type="submit"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            disabled={isSubmitting}
            rightIcon={<ArrowRight className="h-4 w-4" />}
            className="mt-1"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
};
