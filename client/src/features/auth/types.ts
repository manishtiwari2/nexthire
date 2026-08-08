/** Roles the server may report. `CANDIDATE` is legacy and normalised to USER server-side. */
export type Role = 'ADMIN' | 'USER' | 'INTERVIEWER';

/**
 * Capability names from the server's permission matrix (server/src/shared/authz.js).
 * The UI checks these instead of comparing roles, so the two ends cannot drift.
 */
export type Permission =
  | 'public:read'
  | 'practice:use'
  | 'contest:participate'
  | 'notes:manage'
  | 'progress:read'
  | 'sheet:read'
  | 'sheet:manage-own'
  | 'revision:use'
  | 'submission:create'
  | 'profile:manage'
  | 'interview:host'
  | 'question:manage'
  | 'contest:manage'
  | 'user:manage'
  | 'analytics:read'
  | 'submission:manage';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  mobile: string | null;
  role: Role;
  permissions: Permission[];
  avatar: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  mobileVerified: boolean;
  isActive: boolean;
  /** Whether a password is set — a Google-only account has none yet. */
  hasPassword: boolean;
  googleLinked: boolean;
  lastLogin: string | null;
  lastActive: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: {
    bio: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
    skills: string[];
  };
}

export interface AuthSession {
  id: string;
  provider: 'PASSWORD' | 'GOOGLE';
  rememberMe: boolean;
  browser: string | null;
  os: string | null;
  device: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SecurityEvent {
  id: string;
  type: string;
  provider: 'PASSWORD' | 'GOOGLE' | null;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuthServerConfig {
  googleEnabled: boolean;
  googleClientId: string | null;
  googleCodeFlowEnabled: boolean;
  emailVerificationRequired: boolean;
  passwordPolicy: {
    minLength: number;
    maxLength: number;
    requiresUppercase: boolean;
    requiresLowercase: boolean;
    requiresNumber: boolean;
  };
  accessTokenTtlSec: number;
  mailProvider?: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  sessionId: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
}

export interface RegisterResult {
  user: AuthUser;
  emailVerificationRequired: boolean;
  message: string;
  /** Development only — lets the UI offer the verification link without a mail server. */
  devVerificationUrl?: string;
}

// ---- Admin ----------------------------------------------------------------

export interface AdminUser extends AuthUser {
  disabledReason: string | null;
  isLocked: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  activeSessionCount?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
