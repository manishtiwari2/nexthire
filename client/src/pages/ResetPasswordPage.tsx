import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';

import { AuthLayout } from '../features/auth/components/AuthLayout';
import { PasswordField } from '../features/auth/components/PasswordField';
import { PasswordStrengthMeter } from '../features/auth/components/PasswordStrengthMeter';
import { resetPasswordSchema, type ResetPasswordInput } from '../features/auth/schemas';
import { resetPassword } from '../features/auth/api';
import { useNotificationStore } from '../store/useNotificationStore';
import { isApiError } from '../api/client';
import { Alert, Button } from '../shared/components/ui';

/**
 * Reset password, reached from the emailed link.
 *
 * Completing a reset signs every device out (the server bumps `tokenVersion`), which is the
 * point: a reset is the remedy for a compromised account. The screen says so rather than
 * silently logging the user out of their other devices.
 */
export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useNotificationStore();

  const token = searchParams.get('token');
  const [done, setDone] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password');

  const onSubmit = async (values: ResetPasswordInput) => {
    if (!token) return;
    setTokenError(null);
    try {
      await resetPassword({ token, password: values.password, confirmPassword: values.confirmPassword });
      setDone(true);
      addToast('Password updated', 'Sign in with your new password.', 'success');
    } catch (error) {
      if (isApiError(error)) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof ResetPasswordInput, { type: 'server', message });
          }
          return;
        }
        // A dead link is not a field problem — it needs its own path forward.
        if (['TOKEN_INVALID', 'TOKEN_EXPIRED', 'TOKEN_USED'].includes(error.code)) {
          setTokenError(error.message);
          return;
        }
        setTokenError(error.message);
        return;
      }
      setTokenError('Could not reset your password. Please request a new link.');
    }
  };

  // ---- No token in the URL at all ----
  if (!token) {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This link is missing its token. Request a fresh password reset link to continue."
        icon={<ShieldAlert className="h-7 w-7" />}
      >
        <Button type="button" size="lg" fullWidth onClick={() => navigate('/forgot-password')}>
          Request a new link
        </Button>
      </AuthLayout>
    );
  }

  // ---- Success ----
  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        subtitle="Your password has been changed and every device has been signed out."
        icon={<CheckCircle2 className="h-7 w-7" />}
      >
        <Button
          type="button"
          size="lg"
          fullWidth
          onClick={() => navigate('/login', { replace: true })}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Sign in with your new password
        </Button>
      </AuthLayout>
    );
  }

  // ---- Form ----
  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you have not used before. Signing in again will use this password."
      icon={<KeyRound className="h-7 w-7" />}
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {tokenError && (
          <Alert variant="danger" title="This link cannot be used">
            <p>{tokenError}</p>
            <Link
              to="/forgot-password"
              className="mt-2 inline-block font-semibold text-primary hover:underline"
            >
              Request a new reset link
            </Link>
          </Alert>
        )}

        <PasswordField
          label="New password"
          autoComplete="new-password"
          autoFocus
          required
          placeholder="At least 8 characters"
          error={errors.password?.message}
          footer={<PasswordStrengthMeter value={passwordValue || ''} />}
          {...register('password')}
        />

        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          required
          placeholder="Re-enter your new password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Updating password…' : 'Update password'}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-on-surface-muted">
          For your security, all devices will be signed out.
        </p>
      </form>
    </AuthLayout>
  );
};
