import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Github,
  Globe,
  Laptop,
  Link2,
  Link2Off,
  Linkedin,
  LogOut,
  Mail,
  MailWarning,
  Monitor,
  Phone,
  Save,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  User as UserIcon,
} from 'lucide-react';

import { AppLayout } from '../components/layout/AppLayout';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { PasswordField } from '../features/auth/components/PasswordField';
import { PasswordStrengthMeter } from '../features/auth/components/PasswordStrengthMeter';
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from '../features/auth/schemas';
import * as authApi from '../features/auth/api';
import { setAccessToken } from '../api/tokenStore';
import { isApiError } from '../api/client';
import type { AuthSession, SecurityEvent } from '../features/auth/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Tabs,
  Textarea,
} from '../shared/components/ui';

/**
 * Account settings: profile details, password, connected accounts, signed-in devices, and
 * the security timeline. One page with tabs rather than several routes, because these are
 * all "things I do to my account" and the user should not have to hunt.
 */

const EVENT_LABELS: Record<string, string> = {
  REGISTER: 'Account created',
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in attempt',
  LOGOUT: 'Signed out',
  LOGOUT_ALL: 'Signed out of all devices',
  TOKEN_REFRESH: 'Session refreshed',
  TOKEN_REUSE_DETECTED: 'Session reuse detected',
  PASSWORD_RESET_REQUESTED: 'Password reset requested',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_CHANGED: 'Password changed',
  EMAIL_VERIFIED: 'Email verified',
  ACCOUNT_LOCKED: 'Account locked',
  ACCOUNT_DISABLED: 'Account disabled',
  ACCOUNT_ENABLED: 'Account enabled',
  ROLE_CHANGED: 'Role changed',
  GOOGLE_LINKED: 'Google account linked',
  GOOGLE_UNLINKED: 'Google account unlinked',
};

const DANGEROUS_EVENTS = new Set([
  'LOGIN_FAILED',
  'TOKEN_REUSE_DETECTED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_DISABLED',
]);

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function DeviceIcon({ device }: { device: string | null }) {
  if (device === 'Mobile') return <Smartphone className="h-4 w-4" />;
  if (device === 'Tablet') return <Tablet className="h-4 w-4" />;
  if (device === 'API client') return <Monitor className="h-4 w-4" />;
  return <Laptop className="h-4 w-4" />;
}

// ---------------------------------------------------------------------------

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useNotificationStore();
  const { user, setUser, logout, refreshUser } = useAuthStore();
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    // The store's copy can be stale if another tab changed something.
    void refreshUser();
  }, [refreshUser]);

  if (!user) return null;

  return (
    <AppLayout title="Account settings">
      <div className="space-y-6">
        <ProfileHeader />

        <Tabs
          items={[
            { value: 'profile', label: 'Profile' },
            { value: 'security', label: 'Security' },
            { value: 'devices', label: 'Devices' },
            { value: 'activity', label: 'Activity' },
          ]}
          value={tab}
          onChange={setTab}
          className="border-b border-outline-variant"
        />

        {tab === 'profile' && <ProfileDetailsSection />}
        {tab === 'security' && <SecuritySection />}
        {tab === 'devices' && <DevicesSection />}
        {tab === 'activity' && <ActivitySection />}
      </div>
    </AppLayout>
  );

  // ---- Header ----
  function ProfileHeader() {
    const avatar = user!.avatar || user!.avatarUrl || '';
    const roleLabel = user!.role === 'ADMIN' ? 'Administrator' : user!.role === 'INTERVIEWER' ? 'Interviewer' : 'Member';

    return (
      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <img
          src={avatar}
          alt=""
          className="h-16 w-16 shrink-0 rounded-2xl border border-outline-variant bg-surface-container object-cover"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight text-on-surface">{user!.name}</h2>
            <Badge variant={user!.role === 'ADMIN' ? 'accent' : 'primary'}>
              {user!.role === 'ADMIN' ? <ShieldCheck className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
              {roleLabel}
            </Badge>
            {user!.emailVerified ? (
              <Badge variant="success">
                <BadgeCheck className="h-3 w-3" /> Verified
              </Badge>
            ) : (
              <Badge variant="warning">
                <MailWarning className="h-3 w-3" /> Unverified
              </Badge>
            )}
            {user!.googleLinked && (
              <Badge variant="default">
                <Link2 className="h-3 w-3" /> Google
              </Badge>
            )}
          </div>
          <p className="truncate text-sm text-on-surface-variant">{user!.email}</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-on-surface-muted">
            <div className="flex gap-1.5">
              <dt>Joined</dt>
              <dd className="font-medium text-on-surface-variant">{formatDateTime(user!.createdAt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Last sign-in</dt>
              <dd className="font-medium text-on-surface-variant">{formatRelative(user!.lastLogin)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Last active</dt>
              <dd className="font-medium text-on-surface-variant">{formatRelative(user!.lastActive)}</dd>
            </div>
          </dl>
        </div>
      </Card>
    );
  }

  // ---- Profile details ----
  function ProfileDetailsSection() {
    const {
      register,
      handleSubmit,
      setError,
      reset,
      formState: { errors, isSubmitting, isDirty },
    } = useForm<ProfileInput>({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        name: user!.name,
        mobile: user!.mobile || '',
        avatarUrl: user!.avatarUrl || '',
        bio: user!.profile?.bio || '',
        githubUrl: user!.profile?.githubUrl || '',
        linkedinUrl: user!.profile?.linkedinUrl || '',
      },
    });

    const onSubmit = async (values: ProfileInput) => {
      try {
        // Send only the fields that carry a value; the server treats `undefined` as
        // "leave alone" and an empty string would clear a field the user did not touch.
        const payload = Object.fromEntries(
          Object.entries(values).filter(([, value]) => typeof value === 'string' && value.length > 0)
        ) as Parameters<typeof authApi.updateProfile>[0];

        const result = await authApi.updateProfile(payload);
        setUser(result.user);
        reset({
          name: result.user.name,
          mobile: result.user.mobile || '',
          avatarUrl: result.user.avatarUrl || '',
          bio: result.user.profile?.bio || '',
          githubUrl: result.user.profile?.githubUrl || '',
          linkedinUrl: result.user.profile?.linkedinUrl || '',
        });
        addToast('Profile updated', result.message, 'success');
      } catch (error) {
        if (isApiError(error) && error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof ProfileInput, { type: 'server', message });
          }
          return;
        }
        addToast('Could not save', isApiError(error) ? error.message : 'Please try again.', 'error');
      }
    };

    return (
      <Card flush>
        <CardHeader>
            <CardTitle>Profile details</CardTitle>
            <CardDescription>How you appear across NextHire.</CardDescription>
          </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 border-t border-outline-variant p-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              required
              icon={<UserIcon className="h-4 w-4" />}
              error={errors.name?.message}
              {...register('name')}
            />
            <Input
              label="Mobile number"
              type="tel"
              icon={<Phone className="h-4 w-4" />}
              placeholder="+91 98765 43210"
              hint={
                errors.mobile
                  ? undefined
                  : user!.mobileVerified
                    ? 'Verified.'
                    : 'Changing this will require re-verification.'
              }
              error={errors.mobile?.message}
              {...register('mobile')}
            />
          </div>

          {/* Email is read-only: changing it is an identity change that needs its own
              verify-the-new-address flow, not an inline edit. */}
          <Input
            label="Email address"
            value={user!.email}
            readOnly
            disabled
            icon={<Mail className="h-4 w-4" />}
            hint="Contact an administrator to change the email address on your account."
          />

          <Input
            label="Avatar URL"
            type="url"
            icon={<Globe className="h-4 w-4" />}
            placeholder="https://…"
            error={errors.avatarUrl?.message}
            {...register('avatarUrl')}
          />

          <Textarea
            label="Bio"
            rows={3}
            placeholder="A short introduction…"
            error={errors.bio?.message}
            {...register('bio')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="GitHub"
              type="url"
              icon={<Github className="h-4 w-4" />}
              placeholder="https://github.com/you"
              error={errors.githubUrl?.message}
              {...register('githubUrl')}
            />
            <Input
              label="LinkedIn"
              type="url"
              icon={<Linkedin className="h-4 w-4" />}
              placeholder="https://linkedin.com/in/you"
              error={errors.linkedinUrl?.message}
              {...register('linkedinUrl')}
            />
          </div>

          <div className="flex justify-end border-t border-outline-variant pt-4">
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting || !isDirty}
              leftIcon={<Save className="h-4 w-4" />}
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  // ---- Security ----
  function SecuritySection() {
    const isSettingFirst = !user!.hasPassword;
    const [unlinking, setUnlinking] = useState(false);

    const {
      register,
      handleSubmit,
      setError,
      reset,
      watch,
      formState: { errors, isSubmitting },
    } = useForm<ChangePasswordInput>({
      resolver: zodResolver(changePasswordSchema),
      defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    const newPassword = watch('newPassword');

    const onSubmit = async (values: ChangePasswordInput) => {
      try {
        const result = await authApi.changePassword({
          currentPassword: isSettingFirst ? undefined : values.currentPassword,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        });
        // Changing a password bumps tokenVersion, killing the token this tab holds. The
        // server hands back a fresh one so the user is not logged out of the tab they are
        // sitting in — adopt it immediately.
        setAccessToken(result.accessToken, result.expiresIn);
        setUser(result.user);
        reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        addToast('Password updated', result.message, 'success');
        void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      } catch (error) {
        if (isApiError(error) && error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof ChangePasswordInput, { type: 'server', message });
          }
          return;
        }
        addToast('Could not update password', isApiError(error) ? error.message : 'Please try again.', 'error');
      }
    };

    const handleUnlink = async () => {
      setUnlinking(true);
      try {
        const result = await authApi.unlinkGoogle();
        setUser(result.user);
        addToast('Google unlinked', result.message, 'success');
      } catch (error) {
        addToast('Could not unlink', isApiError(error) ? error.message : 'Please try again.', 'error');
      } finally {
        setUnlinking(false);
      }
    };

    return (
      <div className="space-y-6">
        <Card flush>
          <CardHeader>
            <CardTitle>{isSettingFirst ? 'Set a password' : 'Change password'}</CardTitle>
            <CardDescription>{isSettingFirst
                  ? 'Your account signs in with Google. Set a password to also sign in with email.'
                  : 'Choose a strong password you have not used elsewhere.'}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 border-t border-outline-variant p-6" noValidate>
            {!isSettingFirst && (
              <PasswordField
                label="Current password"
                autoComplete="current-password"
                required
                error={errors.currentPassword?.message}
                {...register('currentPassword')}
              />
            )}

            <PasswordField
              label={isSettingFirst ? 'Password' : 'New password'}
              autoComplete="new-password"
              required
              error={errors.newPassword?.message}
              footer={<PasswordStrengthMeter value={newPassword || ''} />}
              {...register('newPassword')}
            />

            <PasswordField
              label="Confirm password"
              autoComplete="new-password"
              required
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Alert variant="info">
              For your security, all your other devices will be signed out. This device stays signed in.
            </Alert>

            <div className="flex justify-end border-t border-outline-variant pt-4">
              <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} leftIcon={<Shield className="h-4 w-4" />}>
                {isSubmitting ? 'Updating…' : isSettingFirst ? 'Set password' : 'Update password'}
              </Button>
            </div>
          </form>
        </Card>

        <Card flush>
          <CardHeader>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>Sign-in methods linked to this account.</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-3 border-t border-outline-variant p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-on-surface-variant">
                {user!.googleLinked ? <Link2 className="h-5 w-5" /> : <Link2Off className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-on-surface">Google</p>
                <p className="text-xs text-on-surface-variant">
                  {user!.googleLinked
                    ? 'You can sign in with your Google account.'
                    : 'Not linked. Sign in with Google once to link it to this account.'}
                </p>
              </div>
            </div>
            {user!.googleLinked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUnlink}
                isLoading={unlinking}
                // Unlinking a Google-only account would leave no way in; the server refuses
                // it too, but disabling the button explains why before they click.
                disabled={unlinking || !user!.hasPassword}
                title={!user!.hasPassword ? 'Set a password first' : undefined}
                leftIcon={<Link2Off className="h-4 w-4" />}
              >
                Unlink
              </Button>
            )}
          </div>
        </Card>

        <Card flush>
          <CardHeader>
            <CardTitle>Sign out everywhere</CardTitle>
            <CardDescription>End every session, including this one.</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-3 border-t border-outline-variant p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-on-surface-variant">
              Use this if you signed in on a device you no longer control.
            </p>
            <Button
              type="button"
              variant="danger"
              size="sm"
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={async () => {
                await logout({ everywhere: true });
                navigate('/login', { replace: true });
              }}
            >
              Sign out of all devices
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ---- Devices ----
  function DevicesSection() {
    const { data, isLoading, isError } = useQuery({
      queryKey: ['auth', 'sessions'],
      queryFn: authApi.fetchSessions,
    });

    const revoke = useMutation({
      mutationFn: authApi.revokeSession,
      onSuccess: async (result) => {
        if (result.wasCurrentSession) {
          // Revoking your own session is a logout — do not leave the UI pretending
          // otherwise.
          await logout({ silent: true });
          navigate('/login', { replace: true });
          return;
        }
        addToast('Device signed out', result.message, 'success');
        void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      },
      onError: (error) =>
        addToast('Could not sign out device', isApiError(error) ? error.message : 'Please try again.', 'error'),
    });

    return (
      <Card flush>
        <CardHeader>
            <CardTitle>Signed-in devices</CardTitle>
            <CardDescription>Every active session on your account. Sign out any you do not recognise.</CardDescription>
          </CardHeader>
        <div className="border-t border-outline-variant">
          {isLoading && (
            <div className="space-y-3 p-6">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {isError && (
            <div className="p-6">
              <Alert variant="danger">Could not load your sessions. Refresh to try again.</Alert>
            </div>
          )}

          {data?.map((session: AuthSession) => (
            <div
              key={session.id}
              className="flex flex-col gap-3 border-b border-outline-variant p-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-on-surface-variant">
                  <DeviceIcon device={session.device} />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
                    {session.browser || 'Unknown browser'}
                    <span className="font-normal text-on-surface-muted">on {session.os || 'Unknown OS'}</span>
                    {session.isCurrent && <Badge variant="success">This device</Badge>}
                    {session.provider === 'GOOGLE' && <Badge variant="default">Google</Badge>}
                    {session.rememberMe && <Badge variant="default">Remembered</Badge>}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {session.ipAddress || 'Unknown IP'} · active {formatRelative(session.lastUsedAt)} · signed in{' '}
                    {formatDateTime(session.createdAt)}
                  </p>
                  <p className="text-[11px] text-on-surface-muted">Expires {formatDateTime(session.expiresAt)}</p>
                </div>
              </div>
              <Button
                type="button"
                variant={session.isCurrent ? 'outline' : 'danger'}
                size="sm"
                isLoading={revoke.isPending && revoke.variables === session.id}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(session.id)}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                {session.isCurrent ? 'Sign out' : 'Revoke'}
              </Button>
            </div>
          ))}

          {data && data.length === 0 && (
            <p className="p-6 text-sm text-on-surface-variant">No active sessions found.</p>
          )}
        </div>
      </Card>
    );
  }

  // ---- Activity ----
  function ActivitySection() {
    const { data, isLoading, isError } = useQuery({
      queryKey: ['auth', 'security-events'],
      queryFn: () => authApi.fetchSecurityEvents(40),
    });

    return (
      <Card flush>
        <CardHeader>
            <CardTitle>Security activity</CardTitle>
            <CardDescription>Recent authentication events on your account.</CardDescription>
          </CardHeader>
        <div className="border-t border-outline-variant">
          {isLoading && (
            <div className="space-y-3 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {isError && (
            <div className="p-6">
              <Alert variant="danger">Could not load your activity.</Alert>
            </div>
          )}

          {data?.map((event: SecurityEvent) => (
            <div key={event.id} className="flex items-start justify-between gap-4 border-b border-outline-variant p-4 last:border-b-0">
              <div className="min-w-0">
                <p
                  className={
                    DANGEROUS_EVENTS.has(event.type)
                      ? 'text-sm font-semibold text-warning'
                      : 'text-sm font-semibold text-on-surface'
                  }
                >
                  {EVENT_LABELS[event.type] || event.type}
                  {event.provider === 'GOOGLE' && <span className="ml-1.5 font-normal text-on-surface-muted">(Google)</span>}
                </p>
                <p className="truncate text-xs text-on-surface-variant">
                  {event.ipAddress || 'Unknown IP'}
                  {event.detail ? ` · ${event.detail}` : ''}
                </p>
              </div>
              <time className="shrink-0 text-xs text-on-surface-muted" dateTime={event.createdAt}>
                {formatRelative(event.createdAt)}
              </time>
            </div>
          ))}

          {data && data.length === 0 && <p className="p-6 text-sm text-on-surface-variant">No activity recorded yet.</p>}
        </div>
      </Card>
    );
  }
};
