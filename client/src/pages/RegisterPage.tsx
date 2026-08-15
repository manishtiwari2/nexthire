import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, Mail, MailCheck, Phone, User as UserIcon } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { AuthDivider, AuthLayout } from '../features/auth/components/AuthLayout';
import { GoogleSignInButton } from '../features/auth/components/GoogleSignInButton';
import { GithubSignInButton } from '../features/auth/components/GithubSignInButton';
import { PasswordField } from '../features/auth/components/PasswordField';
import { PasswordStrengthMeter } from '../features/auth/components/PasswordStrengthMeter';
import { registerSchema, type RegisterInput } from '../features/auth/schemas';
import { resendVerification } from '../features/auth/api';
import { isApiError } from '../api/client';
import { Alert, Button, Input } from '../shared/components/ui';

/**
 * Sign-up page.
 *
 * Registration does not sign the user in — the account is inert until the emailed link is
 * used. On success this swaps to a "check your inbox" panel rather than navigating away, so
 * the user keeps the context of what they just did and can resend from the same screen.
 */
export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useNotificationStore();
  const { register: registerAccount, loginWithGoogleCredential, loadServerConfig, serverConfig, isSubmitting } =
    useAuthStore();

  const [submitted, setSubmitted] = useState<{ email: string; devVerificationUrl?: string } | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    // Validate as the user leaves each field: early enough to be helpful, late enough not
    // to shout at a half-typed email.
    mode: 'onBlur',
    defaultValues: { name: '', email: '', mobile: '', password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password');

  useEffect(() => {
    void loadServerConfig();
  }, [loadServerConfig]);

  const onSubmit = async (values: RegisterInput) => {
    setFormError(null);
    try {
      const result = await registerAccount({
        name: values.name,
        email: values.email,
        mobile: values.mobile,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      setSubmitted({ email: result.user.email, devVerificationUrl: result.devVerificationUrl });
      addToast('Account created', result.message, 'success');
    } catch (error) {
      if (isApiError(error) && error.fields) {
        // Duplicate email / mobile come back as field errors.
        for (const [field, message] of Object.entries(error.fields)) {
          setError(field as keyof RegisterInput, { type: 'server', message });
        }
        return;
      }
      setFormError(isApiError(error) ? error.message : 'Could not create your account. Please try again.');
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setFormError(null);
    try {
      // Google accounts arrive pre-verified, so this path signs straight in.
      const user = await loginWithGoogleCredential({ credential });
      addToast('Welcome to NextHire', `Signed in as ${user.name}`, 'success');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setFormError(isApiError(error) ? error.message : 'Google sign-in failed. Please try again.');
    }
  };

  /**
   * Safety net for a blocked submit. If validation rejects a field the form does not render,
   * nothing would appear on screen and the button would look inert — so surface it instead of
   * failing silently.
   */
  const RENDERED_FIELDS = new Set(['name', 'email', 'mobile', 'password', 'confirmPassword']);
  const onInvalid = (fieldErrors: Record<string, unknown>) => {
    const hidden = Object.keys(fieldErrors).filter((field) => !RENDERED_FIELDS.has(field));
    if (hidden.length) {
      setFormError(`Could not submit the form (${hidden.join(', ')}). Please reload and try again.`);
    }
  };

  const handleResend = async () => {
    if (!submitted) return;
    setResendState('sending');
    try {
      const result = await resendVerification(submitted.email);
      setResendState('sent');
      if (result.devVerificationUrl) {
        setSubmitted({ ...submitted, devVerificationUrl: result.devVerificationUrl });
      }
      addToast('Verification link sent', result.message, 'success');
    } catch (error) {
      setResendState('idle');
      addToast('Could not resend', isApiError(error) ? error.message : 'Please try again shortly.', 'error');
    }
  };

  // ---- Post-registration confirmation ----
  if (submitted) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle={
          <>
            We sent a verification link to <span className="font-semibold text-on-surface">{submitted.email}</span>. Click
            it to activate your account.
          </>
        }
        icon={<MailCheck className="h-7 w-7" />}
        footer={
          <>
            Already verified?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <ol className="space-y-3">
            {[
              'Open the email from NextHire',
              'Click "Verify email address"',
              'Sign in and start practising',
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {index + 1}
                </span>
                <span className="text-sm text-on-surface-variant">{step}</span>
              </li>
            ))}
          </ol>

          {submitted.devVerificationUrl && (
            <Alert variant="info" title="Development mode">
              <p className="mb-2">
                No mail server is configured, so the link is printed in the server console. You can also use it directly:
              </p>
              <Link
                to={submitted.devVerificationUrl.replace(window.location.origin, '')}
                className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Verify this account now
              </Link>
            </Alert>
          )}

          <div className="flex flex-col gap-2 border-t border-outline-variant pt-4 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={handleResend}
              isLoading={resendState === 'sending'}
              disabled={resendState !== 'idle'}
            >
              {resendState === 'sent' ? 'Link sent' : 'Resend link'}
            </Button>
            <Button type="button" fullWidth onClick={() => navigate('/login')} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Go to sign in
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // ---- Registration form ----
  return (
    <AuthLayout
      title="Create your NextHire account"
      subtitle="Track progress, revise with spaced repetition, and compete in live contests."
      width="md"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {formError && <Alert variant="danger">{formError}</Alert>}

        <div className="space-y-3">
          <GoogleSignInButton
            config={serverConfig}
            onCredential={handleGoogleCredential}
            disabled={isSubmitting}
            label="Sign up with Google"
          />

          <GithubSignInButton
            config={serverConfig}
            disabled={isSubmitting}
            label="Sign up with GitHub"
          />
        </div>

        <AuthDivider label="Or sign up with email" />

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4" noValidate>
          <Input
            label="Full name"
            autoComplete="name"
            required
            icon={<UserIcon className="h-4 w-4" />}
            placeholder="Sarah Jenkins"
            error={errors.name?.message}
            {...registerField('name')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              icon={<Mail className="h-4 w-4" />}
              placeholder="you@example.com"
              error={errors.email?.message}
              {...registerField('email')}
            />

            <Input
              label="Mobile number"
              type="tel"
              autoComplete="tel"
              required
              icon={<Phone className="h-4 w-4" />}
              placeholder="+91 98765 43210"
              hint={errors.mobile ? undefined : 'Include your country code.'}
              error={errors.mobile?.message}
              {...registerField('mobile')}
            />
          </div>

          <PasswordField
            label="Password"
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
            error={errors.password?.message}
            footer={<PasswordStrengthMeter value={passwordValue || ''} />}
            {...registerField('password')}
          />

          <PasswordField
            label="Confirm password"
            autoComplete="new-password"
            required
            placeholder="Re-enter your password"
            error={errors.confirmPassword?.message}
            {...registerField('confirmPassword')}
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
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-on-surface-muted">
            We will email you a link to verify your address before your first sign-in.
          </p>
        </form>
      </div>
    </AuthLayout>
  );
};
