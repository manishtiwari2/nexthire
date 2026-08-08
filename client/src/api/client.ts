import axios, { AxiosError, AxiosHeaders, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getCsrfToken,
  isAccessTokenStale,
} from './tokenStore';

/**
 * The HTTP client.
 *
 * Responsibilities beyond plain axios:
 *  • attach the in-memory access token, refreshing it first if it is about to expire;
 *  • on a 401 caused by an expired token, refresh once and replay the request — with all
 *    concurrent 401s waiting on the *same* refresh instead of stampeding the endpoint;
 *  • when the session is genuinely gone, hand control to a single registered handler
 *    (the auth store) rather than reaching into the DOM from here.
 *
 * Response shape: the interceptor unwraps to the API envelope `{ success, data, … }`, which
 * is the convention every existing feature module already expects.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

/** Endpoints that must never trigger the refresh-and-retry dance. */
const NO_RETRY_PATHS = [
  '/auth/refresh',
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/auth/google',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/config',
];

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T;
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * The normalised error every caller sees. `code` is the stable machine-readable reason;
 * `fields` maps directly onto react-hook-form's `setError`.
 */
export interface ApiError {
  message: string;
  code: string;
  status: number;
  fields?: Record<string, string>;
  retryAfterSec?: number;
  /** Anything else the endpoint returned (e.g. `canResend`, `attemptsRemaining`). */
  extra?: Record<string, unknown>;
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // Required for the HTTP-only refresh cookie to be sent cross-origin.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/** A bare client for /auth/refresh: using `apiClient` would recurse through these interceptors. */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Session-loss handling
// ---------------------------------------------------------------------------

type SessionExpiredHandler = (reason: ApiError) => void;
let onSessionExpired: SessionExpiredHandler | null = null;

/**
 * Registered once by the auth store. Keeps knowledge of routing and toasts out of the
 * transport layer.
 */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

// ---------------------------------------------------------------------------
// Refresh (single-flight)
// ---------------------------------------------------------------------------

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchange the refresh cookie for a new access token.
 *
 * Concurrent callers share one request: without this, ten parallel queries all hitting a
 * 401 would fire ten refreshes, and because every refresh *rotates* the token, nine of
 * them would present an already-rotated token — which the server correctly treats as
 * theft and responds to by revoking the entire session.
 *
 * @returns the new access token, or null if the session is gone
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrf) headers['X-CSRF-Token'] = csrf;

      const response = await refreshClient.post<ApiEnvelope<{ accessToken: string; expiresIn: number }>>(
        '/auth/refresh',
        {},
        { headers }
      );
      const { accessToken, expiresIn } = response.data.data;
      setAccessToken(accessToken, expiresIn);
      return accessToken;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      // Cleared in a microtask so callers that awaited this promise all observe the same
      // result before a new refresh can begin.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// Request interceptor
// ---------------------------------------------------------------------------

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
  /** Set by callers that want a 401 to surface instead of triggering the refresh flow. */
  skipAuthRefresh?: boolean;
}

apiClient.interceptors.request.use(
  async (config: RetriableConfig) => {
    const path = config.url || '';
    const isAuthEndpoint = NO_RETRY_PATHS.some((p) => path.startsWith(p));

    // Proactive refresh: if the token is within the skew window, renew it before spending
    // a round trip on a request that would come back 401 anyway.
    if (!isAuthEndpoint && !config.skipAuthRefresh && getAccessToken() && isAccessTokenStale()) {
      await refreshAccessToken();
    }

    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Cookie-authenticated, state-changing endpoints need the double-submit CSRF header.
    if (path.startsWith('/auth/refresh') || path.startsWith('/auth/logout')) {
      const csrf = getCsrfToken();
      if (csrf && config.headers) config.headers['X-CSRF-Token'] = csrf;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor
// ---------------------------------------------------------------------------

/** Codes that mean "this token is stale, a refresh might fix it". */
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'TOKEN_MISSING']);
/** Codes that mean "the session is over, stop trying". */
const TERMINAL_CODES = new Set([
  'TOKEN_REVOKED',
  'SESSION_REVOKED',
  'SESSION_REUSE',
  'SESSION_EXPIRED',
  'SESSION_INVALID',
  'USER_NOT_FOUND',
  'ACCOUNT_DISABLED',
  'NO_SESSION',
]);

function toApiError(error: AxiosError): ApiError {
  const status = error.response?.status ?? 0;
  const body = error.response?.data as
    | { error?: string; code?: string; fields?: Record<string, string>; retryAfterSec?: number }
    | undefined;

  if (!error.response) {
    return {
      message: 'Cannot reach the server. Check your connection and try again.',
      code: 'NETWORK_ERROR',
      status: 0,
    };
  }

  const { error: message, code, fields, retryAfterSec, ...extra } = body ?? {};
  return {
    message: message || error.message || 'Something went wrong',
    code: code || `HTTP_${status}`,
    status,
    fields,
    retryAfterSec,
    extra: Object.keys(extra).length ? (extra as Record<string, unknown>) : undefined,
  };
}

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const apiError = toApiError(error);

    const path = config?.url || '';
    const isAuthEndpoint = NO_RETRY_PATHS.some((p) => path.startsWith(p));

    if (
      status === 401 &&
      config &&
      !config._retriedAfterRefresh &&
      !config.skipAuthRefresh &&
      !isAuthEndpoint &&
      REFRESHABLE_CODES.has(apiError.code)
    ) {
      config._retriedAfterRefresh = true;
      const token = await refreshAccessToken();

      if (token) {
        if (!config.headers) config.headers = new AxiosHeaders();
        config.headers.set('Authorization', `Bearer ${token}`);
        return apiClient.request(config as AxiosRequestConfig);
      }

      // Refresh failed: the session is genuinely over.
      onSessionExpired?.({
        ...apiError,
        message: 'Your session has expired. Please sign in again.',
        code: 'SESSION_EXPIRED',
      });
      return Promise.reject({
        ...apiError,
        message: 'Your session has expired. Please sign in again.',
        code: 'SESSION_EXPIRED',
      } satisfies ApiError);
    }

    // Unrecoverable session state — no point retrying.
    if ((status === 401 || status === 403) && TERMINAL_CODES.has(apiError.code) && !isAuthEndpoint) {
      clearAccessToken();
      onSessionExpired?.(apiError);
    }

    return Promise.reject(apiError);
  }
);

/** Narrow an unknown catch value to a message safe to render. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
