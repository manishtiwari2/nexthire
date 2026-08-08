import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, KeyRound, Mail, MailCheck } from 'lucide-react';

import { AuthLayout } from '../features/auth/components/AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../features/auth/schemas';
import { forgotPassword } from '../features/auth/api';
import { isApiError } from '../api/client';
import { Alert, Button, Input } from '../shared/components/ui';

/**
 * Forgot password.
 *
 * The confirmation is deliberately identical whether or not the address is registered — the
 * server does not distinguish, and neither does this screen. Telling a visitor "no such
 * account" here would turn the form into a free account-enumeration tool.
 */
export const ForgotPasswordPage: React.FC = () => {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setFormError(null);
    try {
      const result = await forgotPassword(values.email);
      setSentTo(values.email);
      if (result.devResetUrl) setDevResetUrl(result.devResetUrl);
    } catch (error) {
      setFormError(
        isApiError(error) ? error.message : 'Could not send the reset link. Please try again shortly.'
      );
    }
  };

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle={
          <>
            If an account exists for <span className="font-semibold text-on-surface">{sentTo}</span>, a password reset
            link is on its way. The link expires in one hour.
          </>
        }
        icon={<MailCheck className="h-7 w-7" />}
        footer={
          <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Did not receive it? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setDevResetUrl(null);
              }}
              className="font-semibold text-primary hover:underline"
            >
              try a different address
            </button>
            .
          </p>

          {devResetUrl && (
            <Alert variant="info" title="Development mode">
              No mail server is configured, so the link is printed in the server console. You can also{' '}
              <Link
                to={devResetUrl.replace(window.location.origin, '')}
                className="font-semibold text-primary hover:underline"
              >
                open it directly
              </Link>
              .
            </Alert>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a link to choose a new password."
      icon={<KeyRound className="h-7 w-7" />}
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          autoFocus
          required
          icon={<Mail className="h-4 w-4" />}
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Sending link…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
};
