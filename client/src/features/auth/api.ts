import { apiClient, type ApiEnvelope } from '../../api/client';
import type {
  AdminUser,
  AuthServerConfig,
  AuthSession,
  AuthUser,
  LoginResult,
  Pagination,
  RegisterResult,
  SecurityEvent,
} from './types';

/**
 * Typed wrappers over the auth endpoints.
 *
 * `apiClient`'s response interceptor already unwraps to the `{ success, data }` envelope,
 * so each helper returns the `data` payload directly. Errors arrive as `ApiError` — see
 * api/client.ts — carrying `code` and, for 422/409, per-field messages.
 */

type Env<T> = ApiEnvelope<T>;

// ---- Discovery ------------------------------------------------------------

export async function fetchAuthConfig(): Promise<AuthServerConfig> {
  const res = (await apiClient.get('/auth/config')) as Env<AuthServerConfig>;
  return res.data;
}

// ---- Registration & verification -----------------------------------------

export async function register(input: {
  name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
}): Promise<RegisterResult> {
  const res = (await apiClient.post('/auth/register', input)) as Env<RegisterResult>;
  return res.data;
}

export async function verifyEmail(token: string): Promise<{ verified?: boolean; alreadyVerified?: boolean; message: string }> {
  const res = (await apiClient.post('/auth/verify-email', { token })) as Env<{
    verified?: boolean;
    alreadyVerified?: boolean;
    message: string;
  }>;
  return res.data;
}

export async function resendVerification(email: string): Promise<{ message: string; devVerificationUrl?: string }> {
  const res = (await apiClient.post('/auth/resend-verification', { email })) as Env<{
    message: string;
    devVerificationUrl?: string;
  }>;
  return res.data;
}

// ---- Sign in / out --------------------------------------------------------

export async function login(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): Promise<LoginResult> {
  const res = (await apiClient.post('/auth/login', input)) as Env<LoginResult>;
  return res.data;
}

export async function loginWithGoogleCredential(input: {
  credential: string;
  rememberMe?: boolean;
}): Promise<LoginResult & { isNewAccount?: boolean; accountLinked?: boolean }> {
  const res = (await apiClient.post('/auth/google', input)) as Env<
    LoginResult & { isNewAccount?: boolean; accountLinked?: boolean }
  >;
  return res.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function logoutEverywhere(): Promise<{ revokedSessions: number; message: string }> {
  const res = (await apiClient.post('/auth/logout-all')) as Env<{ revokedSessions: number; message: string }>;
  return res.data;
}

// ---- Current user ---------------------------------------------------------

export async function fetchMe(): Promise<{
  user: AuthUser;
  sessionId: string | null;
  emailVerificationRequired: boolean;
}> {
  const res = (await apiClient.get('/auth/me')) as Env<{
    user: AuthUser;
    sessionId: string | null;
    emailVerificationRequired: boolean;
  }>;
  return res.data;
}

// ---- Password -------------------------------------------------------------

export async function forgotPassword(email: string): Promise<{ message: string; devResetUrl?: string }> {
  const res = (await apiClient.post('/auth/forgot-password', { email })) as Env<{
    message: string;
    devResetUrl?: string;
  }>;
  return res.data;
}

export async function resetPassword(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ message: string }> {
  const res = (await apiClient.post('/auth/reset-password', input)) as Env<{ message: string }>;
  return res.data;
}

export async function changePassword(input: {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ accessToken: string; expiresIn: number; user: AuthUser; message: string }> {
  const res = (await apiClient.post('/auth/change-password', input)) as Env<{
    accessToken: string;
    expiresIn: number;
    user: AuthUser;
    message: string;
  }>;
  return res.data;
}

// ---- Profile --------------------------------------------------------------

export async function updateProfile(input: {
  name?: string;
  mobile?: string;
  avatarUrl?: string;
  bio?: string;
  githubUrl?: string;
  linkedinUrl?: string;
}): Promise<{ user: AuthUser; message: string }> {
  const res = (await apiClient.patch('/auth/profile', input)) as Env<{ user: AuthUser; message: string }>;
  return res.data;
}

export async function unlinkGoogle(): Promise<{ user: AuthUser; message: string }> {
  const res = (await apiClient.post('/auth/google/unlink')) as Env<{ user: AuthUser; message: string }>;
  return res.data;
}

// ---- Sessions & security --------------------------------------------------

export async function fetchSessions(): Promise<AuthSession[]> {
  const res = (await apiClient.get('/auth/sessions')) as Env<{ sessions: AuthSession[] }>;
  return res.data.sessions;
}

export async function revokeSession(id: string): Promise<{ wasCurrentSession: boolean; message: string }> {
  const res = (await apiClient.delete(`/auth/sessions/${id}`)) as Env<{
    wasCurrentSession: boolean;
    message: string;
  }>;
  return res.data;
}

export async function fetchSecurityEvents(take = 25): Promise<SecurityEvent[]> {
  const res = (await apiClient.get('/auth/security-events', { params: { take } })) as Env<{
    events: SecurityEvent[];
  }>;
  return res.data.events;
}

// ---- Admin --------------------------------------------------------------

export interface AdminUserQuery {
  q?: string;
  role?: string;
  status?: 'active' | 'disabled' | 'unverified';
  page?: number;
  pageSize?: number;
}

export async function adminListUsers(
  params: AdminUserQuery
): Promise<{ users: AdminUser[]; pagination: Pagination }> {
  const res = (await apiClient.get('/auth/admin/users', { params })) as Env<{
    users: AdminUser[];
    pagination: Pagination;
  }>;
  return res.data;
}

export async function adminGetUser(id: string): Promise<{
  user: AdminUser;
  sessions: AuthSession[];
  events: SecurityEvent[];
  stats: { submissions: number; contests: number };
  isConfiguredAdmin: boolean;
}> {
  const res = (await apiClient.get(`/auth/admin/users/${id}`)) as Env<{
    user: AdminUser;
    sessions: AuthSession[];
    events: SecurityEvent[];
    stats: { submissions: number; contests: number };
    isConfiguredAdmin: boolean;
  }>;
  return res.data;
}

export async function adminGetLoginHistory(id: string): Promise<SecurityEvent[]> {
  const res = (await apiClient.get(`/auth/admin/users/${id}/login-history`)) as Env<{
    events: SecurityEvent[];
  }>;
  return res.data.events;
}

export async function adminSetUserStatus(
  id: string,
  isActive: boolean,
  reason?: string
): Promise<{ user: AdminUser; message: string }> {
  const res = (await apiClient.patch(`/auth/admin/users/${id}/status`, { isActive, reason })) as Env<{
    user: AdminUser;
    message: string;
  }>;
  return res.data;
}

export async function adminSetUserRole(id: string, role: string): Promise<{ user: AdminUser; message: string }> {
  const res = (await apiClient.patch(`/auth/admin/users/${id}/role`, { role })) as Env<{
    user: AdminUser;
    message: string;
  }>;
  return res.data;
}

export async function adminSendPasswordReset(
  id: string
): Promise<{ message: string; devResetUrl?: string }> {
  const res = (await apiClient.post(`/auth/admin/users/${id}/reset-password`)) as Env<{
    message: string;
    devResetUrl?: string;
  }>;
  return res.data;
}

export async function adminUnlockUser(id: string): Promise<{ user: AdminUser; message: string }> {
  const res = (await apiClient.post(`/auth/admin/users/${id}/unlock`)) as Env<{
    user: AdminUser;
    message: string;
  }>;
  return res.data;
}

export async function adminRevokeUserSessions(
  id: string
): Promise<{ revokedSessions: number; message: string }> {
  const res = (await apiClient.post(`/auth/admin/users/${id}/revoke-sessions`)) as Env<{
    revokedSessions: number;
    message: string;
  }>;
  return res.data;
}

export interface AuthAnalytics {
  users: {
    total: number;
    active: number;
    disabled: number;
    unverified: number;
    admins: number;
    googleLinked: number;
    newThisWeek: number;
    activeToday: number;
  };
  sessions: { live: number };
  security: { failedLoginsLast24h: number };
}

export async function adminFetchAnalytics(): Promise<AuthAnalytics> {
  const res = (await apiClient.get('/auth/admin/analytics')) as Env<AuthAnalytics>;
  return res.data;
}

/** Browser navigation into the server-side Google authorization-code flow. */
export function googleAuthUrl(redirectTo: string, rememberMe: boolean): string {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
  const params = new URLSearchParams({ redirect: redirectTo, remember: String(rememberMe) });
  return `${base}/auth/google/start?${params.toString()}`;
}
