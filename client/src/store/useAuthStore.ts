import { create } from 'zustand';
import * as authApi from '../features/auth/api';
import type { AuthServerConfig, AuthUser, Permission, Role } from '../features/auth/types';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '../api/tokenStore';
import { refreshAccessToken, setSessionExpiredHandler, type ApiError } from '../api/client';
import { useNotificationStore } from './useNotificationStore';

/**
 * Authentication state.
 *
 * The access token is *not* kept here — it lives in `api/tokenStore` (a module variable,
 * never localStorage) so no React render can leak it into a devtools snapshot and no XSS
 * payload can read a durable credential. This store holds the user, the derived
 * permission set, and the status flags the UI branches on.
 *
 * Persistence across reloads comes from the HTTP-only refresh cookie: `bootstrap()` calls
 * `/auth/refresh` once on app start, so a hard refresh restores the session without the
 * client ever storing a token.
 */

/** `status` is what guards read; deriving it from booleans led to flicker on first paint. */
export type AuthStatus = 'idle' | 'bootstrapping' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  /** Server capabilities (Google enabled, password policy). Loaded lazily. */
  serverConfig: AuthServerConfig | null;
  /** True while a login/register/logout request is in flight. */
  isSubmitting: boolean;
  /**
   * Path the user was trying to reach when they were bounced to /login, so they land
   * there instead of the dashboard after signing in.
   */
  redirectAfterLogin: string | null;

  // ---- derived helpers ----
  isAuthenticated: () => boolean;
  can: (permission: Permission) => boolean;
  hasRole: (...roles: Role[]) => boolean;

  // ---- actions ----
  bootstrap: () => Promise<void>;
  loadServerConfig: () => Promise<AuthServerConfig | null>;
  login: (input: { email: string; password: string; rememberMe?: boolean }) => Promise<AuthUser>;
  loginWithGoogleCredential: (input: { credential: string; rememberMe?: boolean }) => Promise<AuthUser>;
  /** Adopt tokens handed back by the OAuth code-flow redirect. */
  adoptTokens: (accessToken: string, expiresIn: number) => Promise<AuthUser>;
  register: (input: {
    name: string;
    email: string;
    mobile: string;
    password: string;
    confirmPassword: string;
  }) => Promise<Awaited<ReturnType<typeof authApi.register>>>;
  logout: (options?: { everywhere?: boolean; silent?: boolean }) => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser) => void;
  setRedirectAfterLogin: (path: string | null) => void;
  /** Called by the API client when the session dies mid-flight. */
  handleSessionExpired: (reason: ApiError) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  // Starts as 'bootstrapping' so guards show a loader instead of briefly redirecting to
  // /login on the very first paint after a reload.
  status: 'bootstrapping',
  serverConfig: null,
  isSubmitting: false,
  redirectAfterLogin: null,

  isAuthenticated: () => get().status === 'authenticated' && Boolean(get().user),

  can: (permission) => Boolean(get().user?.permissions?.includes(permission)),

  hasRole: (...roles) => {
    const role = get().user?.role;
    return Boolean(role && roles.includes(role));
  },

  /**
   * Restore the session on app start. Silent by design: having no session is the normal
   * case for a visitor, not an error worth surfacing.
   */
  bootstrap: async () => {
    set({ status: 'bootstrapping' });
    try {
      const token = await refreshAccessToken();
      if (!token) {
        set({ user: null, status: 'unauthenticated' });
        return;
      }
      const { user } = await authApi.fetchMe();
      set({ user, status: 'authenticated' });
    } catch {
      clearAccessToken();
      set({ user: null, status: 'unauthenticated' });
    }
  },

  loadServerConfig: async () => {
    const existing = get().serverConfig;
    if (existing) return existing;
    try {
      const serverConfig = await authApi.fetchAuthConfig();
      set({ serverConfig });
      return serverConfig;
    } catch {
      // A missing config only costs us the Google button; the page still works.
      return null;
    }
  },

  login: async ({ email, password, rememberMe }) => {
    set({ isSubmitting: true });
    try {
      const result = await authApi.login({ email, password, rememberMe });
      setAccessToken(result.accessToken, result.expiresIn);
      set({ user: result.user, status: 'authenticated' });
      return result.user;
    } finally {
      set({ isSubmitting: false });
    }
  },

  loginWithGoogleCredential: async ({ credential, rememberMe }) => {
    set({ isSubmitting: true });
    try {
      const result = await authApi.loginWithGoogleCredential({ credential, rememberMe });
      setAccessToken(result.accessToken, result.expiresIn);
      set({ user: result.user, status: 'authenticated' });
      return result.user;
    } finally {
      set({ isSubmitting: false });
    }
  },

  adoptTokens: async (accessToken, expiresIn) => {
    setAccessToken(accessToken, expiresIn);
    const { user } = await authApi.fetchMe();
    set({ user, status: 'authenticated' });
    return user;
  },

  /**
   * Registration deliberately does not sign the user in — the account is inert until the
   * emailed link is used. The caller shows the "check your inbox" screen.
   */
  register: async (input) => {
    set({ isSubmitting: true });
    try {
      return await authApi.register(input);
    } finally {
      set({ isSubmitting: false });
    }
  },

  logout: async ({ everywhere = false, silent = false } = {}) => {
    set({ isSubmitting: true });
    try {
      if (everywhere) {
        await authApi.logoutEverywhere();
      } else {
        await authApi.logout();
      }
    } catch {
      // A failed logout still clears the client. Leaving the UI "signed in" when the user
      // asked to leave is the worse outcome; the server-side session expires on its own.
    } finally {
      clearAccessToken();
      set({ user: null, status: 'unauthenticated', isSubmitting: false, redirectAfterLogin: null });
      if (!silent) {
        useNotificationStore
          .getState()
          .addToast('Signed out', everywhere ? 'All devices have been signed out.' : 'You have been signed out.', 'info');
      }
    }
  },

  refreshUser: async () => {
    if (!getAccessToken()) return null;
    try {
      const { user } = await authApi.fetchMe();
      set({ user, status: 'authenticated' });
      return user;
    } catch {
      return null;
    }
  },

  setUser: (user) => set({ user, status: 'authenticated' }),

  setRedirectAfterLogin: (path) => set({ redirectAfterLogin: path }),

  handleSessionExpired: (reason) => {
    // Only announce it to someone who *was* signed in — otherwise an anonymous visitor
    // hitting a protected endpoint gets a confusing "session expired" toast.
    const wasAuthenticated = get().status === 'authenticated';
    clearAccessToken();
    set({ user: null, status: 'unauthenticated' });

    if (wasAuthenticated) {
      const title = reason.code === 'ACCOUNT_DISABLED' ? 'Account disabled' : 'Session ended';
      useNotificationStore.getState().addToast(title, reason.message, 'warning');
      // Remember where they were so signing back in returns them there.
      const current = `${window.location.pathname}${window.location.search}`;
      if (!current.startsWith('/login')) set({ redirectAfterLogin: current });
    }
  },
}));

/**
 * Bridge the transport layer to the store. Registered at module load so it is in place
 * before the first request; `api/client` stays free of any store or router imports.
 */
setSessionExpiredHandler((reason) => {
  useAuthStore.getState().handleSessionExpired(reason);
});
