import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Lock,
  LogOut,
  Search,
  ShieldCheck,
  Unlock,
  Users,
  X,
} from 'lucide-react';

import { AppLayout } from '../components/layout/AppLayout';
import { useNotificationStore } from '../store/useNotificationStore';
import { useAuthStore } from '../store/useAuthStore';
import * as authApi from '../features/auth/api';
import { isApiError } from '../api/client';
import type { AdminUser } from '../features/auth/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionHeader,
  Select,
  Skeleton,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableContainer,
} from '../shared/components/ui';

/**
 * Admin user management: search, inspect, enable/disable, force a password reset, clear a
 * lockout, and revoke sessions.
 *
 * Role is shown, not edited. ADMIN is granted entirely by the server's ADMIN_EMAILS config
 * and re-derived on every sign-in, so there is nothing a role picker here could change that
 * the next login would not immediately undo. (There used to be one; with only ADMIN and USER
 * left it could only ever return "already USER" or a 409.) An admin also cannot act on their
 * own account.
 */

function formatRelative(value: string | null | undefined): string {
  if (!value) return 'never';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export const AdminUsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { addToast } = useNotificationStore();
  const currentUser = useAuthStore((state) => state.user);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the search box so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const listQuery = useQuery({
    queryKey: ['admin', 'users', { q: debouncedSearch, role, status, page }],
    queryFn: () =>
      authApi.adminListUsers({
        q: debouncedSearch || undefined,
        role: role || undefined,
        status: (status || undefined) as 'active' | 'disabled' | 'unverified' | undefined,
        page,
        pageSize: 20,
      }),
  });

  const analyticsQuery = useQuery({
    queryKey: ['admin', 'auth-analytics'],
    queryFn: authApi.adminFetchAnalytics,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'auth-analytics'] });
  };

  const onMutationError = (label: string) => (error: unknown) =>
    addToast(label, isApiError(error) ? error.message : 'Please try again.', 'error');

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive, reason }: { id: string; isActive: boolean; reason?: string }) =>
      authApi.adminSetUserStatus(id, isActive, reason),
    onSuccess: (result) => {
      addToast('Account updated', result.message, 'success');
      invalidate();
    },
    onError: onMutationError('Could not update account'),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => authApi.adminSendPasswordReset(id),
    onSuccess: (result) => {
      addToast('Reset link sent', result.message, 'success');
      invalidate();
    },
    onError: onMutationError('Could not send reset link'),
  });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => authApi.adminUnlockUser(id),
    onSuccess: (result) => {
      addToast('Lockout cleared', result.message, 'success');
      invalidate();
    },
    onError: onMutationError('Could not clear lockout'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => authApi.adminRevokeUserSessions(id),
    onSuccess: (result) => {
      addToast('Sessions revoked', result.message, 'success');
      invalidate();
    },
    onError: onMutationError('Could not revoke sessions'),
  });

  const anyPending =
    statusMutation.isPending ||
    resetMutation.isPending ||
    unlockMutation.isPending ||
    revokeMutation.isPending;

  const users = listQuery.data?.users ?? [];
  const pagination = listQuery.data?.pagination;
  const analytics = analyticsQuery.data;

  const hasFilters = useMemo(() => Boolean(debouncedSearch || role || status), [debouncedSearch, role, status]);

  const clearFilters = () => {
    setSearch('');
    setRole('');
    setStatus('');
    setPage(1);
  };

  return (
    <AppLayout title="User management">
      <div className="space-y-6">
        <SectionHeader
          icon={<Users />}
          title="User management"
          description="Search accounts, manage access, and review authentication activity."
        />

        {/* ---- Headline numbers ---- */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {analyticsQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)
            : analytics && (
                <>
                  <StatCard label="Total users" value={analytics.users.total} icon={<Users />} />
                  <StatCard
                    label="Active today"
                    value={analytics.users.activeToday}
                    icon={<Activity />}
                    hint={`${analytics.sessions.live} live session(s)`}
                  />
                  <StatCard
                    label="Unverified"
                    value={analytics.users.unverified}
                    icon={<KeyRound />}
                    hint={`${analytics.users.disabled} disabled`}
                  />
                  <StatCard
                    label="Failed logins (24h)"
                    value={analytics.security.failedLoginsLast24h}
                    icon={<Ban />}
                    hint={`${analytics.users.admins} admin(s)`}
                  />
                </>
              )}
        </div>

        {/* ---- Filters ---- */}
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            containerClassName="flex-1"
            label="Search"
            placeholder="Name, email or mobile…"
            icon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            containerClassName="sm:w-44"
            label="Role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </Select>
          <Select
            containerClassName="sm:w-44"
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="unverified">Unverified</option>
          </Select>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={clearFilters} leftIcon={<X className="h-4 w-4" />}>
              Clear
            </Button>
          )}
        </Card>

        {/* ---- Table ---- */}
        {listQuery.isError && <Alert variant="danger">Could not load users. Refresh to try again.</Alert>}

        {listQuery.isLoading ? (
          <Card className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No users found"
            description={hasFilters ? 'Try a different search or clear the filters.' : 'No accounts exist yet.'}
            action={
              hasFilters ? (
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>User</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last active</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((user: AdminUser) => {
                  const isSelf = user.id === currentUser?.id;
                  const isAdminRole = user.role === 'ADMIN';
                  const expanded = expandedId === user.id;

                  return (
                    <React.Fragment key={user.id}>
                      <TR>
                        <TD>
                          <div className="flex items-center gap-3">
                            <img
                              src={user.avatar || user.avatarUrl || ''}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-lg border border-outline-variant bg-surface-container object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-on-surface">
                                {user.name}
                                {isSelf && <span className="ml-1.5 text-xs font-normal text-on-surface-muted">(you)</span>}
                              </p>
                              <p className="truncate text-xs text-on-surface-variant">{user.email}</p>
                              {user.mobile && <p className="truncate text-xs text-on-surface-muted">{user.mobile}</p>}
                            </div>
                          </div>
                        </TD>

                        <TD>
                          {isAdminRole ? (
                            <Badge variant="accent">
                              <ShieldCheck className="h-3 w-3" /> Admin
                            </Badge>
                          ) : (
                            <Badge variant="default">User</Badge>
                          )}
                        </TD>

                        <TD>
                          <div className="flex flex-wrap gap-1.5">
                            {user.isActive ? (
                              <Badge variant="success">Active</Badge>
                            ) : (
                              <Badge variant="danger">Disabled</Badge>
                            )}
                            {!user.emailVerified && <Badge variant="warning">Unverified</Badge>}
                            {user.isLocked && (
                              <Badge variant="danger">
                                <Lock className="h-3 w-3" /> Locked
                              </Badge>
                            )}
                            {user.googleLinked && <Badge variant="default">Google</Badge>}
                            {user.githubLinked && <Badge variant="default">GitHub</Badge>}
                          </div>
                        </TD>

                        <TD>
                          <p className="text-xs text-on-surface-variant">{formatRelative(user.lastActive)}</p>
                          <p className="text-[11px] text-on-surface-muted">
                            {user.activeSessionCount ?? 0} session(s)
                          </p>
                        </TD>

                        <TD className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedId(expanded ? null : user.id)}
                            >
                              {expanded ? 'Hide' : 'History'}
                            </Button>

                            {user.isLocked && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={anyPending}
                                onClick={() => unlockMutation.mutate(user.id)}
                                leftIcon={<Unlock className="h-3.5 w-3.5" />}
                              >
                                Unlock
                              </Button>
                            )}

                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={anyPending}
                              onClick={() => resetMutation.mutate(user.id)}
                              leftIcon={<KeyRound className="h-3.5 w-3.5" />}
                            >
                              Reset
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={anyPending || (user.activeSessionCount ?? 0) === 0}
                              onClick={() => revokeMutation.mutate(user.id)}
                              leftIcon={<LogOut className="h-3.5 w-3.5" />}
                            >
                              Revoke
                            </Button>

                            <Button
                              type="button"
                              variant={user.isActive ? 'danger' : 'primary'}
                              size="sm"
                              disabled={isSelf || anyPending}
                              title={isSelf ? 'You cannot disable your own account' : undefined}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: user.id,
                                  isActive: !user.isActive,
                                  reason: user.isActive ? 'Disabled by an administrator' : undefined,
                                })
                              }
                              leftIcon={
                                user.isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />
                              }
                            >
                              {user.isActive ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        </TD>
                      </TR>

                      {expanded && (
                        <TR>
                          <TD colSpan={5} className="bg-surface-container-low">
                            <LoginHistory userId={user.id} disabledReason={user.disabledReason} />
                          </TD>
                        </TR>
                      )}
                    </React.Fragment>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
        )}

        {/* ---- Pagination ---- */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-on-surface-variant">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} user(s)
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                rightIcon={<ChevronRight className="h-4 w-4" />}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

/** Login history for one account, loaded on demand when a row is expanded. */
const LoginHistory: React.FC<{ userId: string; disabledReason: string | null }> = ({ userId, disabledReason }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'login-history', userId],
    queryFn: () => authApi.adminGetLoginHistory(userId),
  });

  return (
    <div className="space-y-3 py-2">
      {disabledReason && (
        <Alert variant="warning" title="Disabled">
          {disabledReason}
        </Alert>
      )}

      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Login history</p>

      {isLoading && <Skeleton className="h-16 w-full" />}
      {isError && <p className="text-xs text-danger">Could not load login history.</p>}

      {data && data.length === 0 && <p className="text-xs text-on-surface-variant">No authentication events recorded.</p>}

      {data && data.length > 0 && (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {data.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span
                  className={
                    event.type === 'LOGIN_SUCCESS'
                      ? 'font-semibold text-success'
                      : event.type === 'LOGIN_FAILED' || event.type === 'ACCOUNT_LOCKED'
                        ? 'font-semibold text-danger'
                        : 'font-semibold text-on-surface-variant'
                  }
                >
                  {event.type}
                </span>
                {event.provider && <span className="ml-1.5 text-on-surface-muted">via {event.provider}</span>}
                <span className="ml-1.5 text-on-surface-muted">{event.ipAddress || 'unknown IP'}</span>
                {event.detail && <span className="ml-1.5 text-on-surface-muted">· {event.detail}</span>}
              </span>
              <time className="shrink-0 text-on-surface-muted" dateTime={event.createdAt}>
                {formatRelative(event.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
