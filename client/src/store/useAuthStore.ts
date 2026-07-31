import { create } from 'zustand';
import { apiClient } from '../api/client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CANDIDATE';
  avatarUrl?: string;
  isVerified: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: (payload: { credential?: string; email?: string; name?: string; avatarUrl?: string }) => Promise<void>;
  login: (email: string, password?: string) => Promise<void>;
  register: (name: string, email: string, password?: string, role?: string) => Promise<void>;
  updateUser: (partialUser: Partial<User>) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

function safeParseUser(): User | null {
  try {
    const raw = localStorage.getItem('nexthire_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem('nexthire_user');
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: safeParseUser(),
  token: localStorage.getItem('nexthire_access_token') || null,
  isAuthenticated: !!localStorage.getItem('nexthire_access_token'),
  isLoading: false,

  loginWithGoogle: async (payload) => {
    set({ isLoading: true });
    try {
      const res: any = await apiClient.post('/auth/google', payload);
      const { accessToken, user } = res.data;

      localStorage.setItem('nexthire_access_token', accessToken);
      localStorage.setItem('nexthire_user', JSON.stringify(user));

      set({ user, token: accessToken, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res: any = await apiClient.post('/auth/login', { email, password });
      const { accessToken, user } = res.data;

      localStorage.setItem('nexthire_access_token', accessToken);
      localStorage.setItem('nexthire_user', JSON.stringify(user));

      set({ user, token: accessToken, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (name, email, password, role = 'CANDIDATE') => {
    set({ isLoading: true });
    try {
      const res: any = await apiClient.post('/auth/register', { name, email, password, role });
      const { accessToken, user } = res.data;

      localStorage.setItem('nexthire_access_token', accessToken);
      localStorage.setItem('nexthire_user', JSON.stringify(user));

      set({ user, token: accessToken, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  updateUser: (partialUser) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...partialUser };
    localStorage.setItem('nexthire_user', JSON.stringify(updated));
    set({ user: updated });
  },

  logout: () => {
    localStorage.removeItem('nexthire_access_token');
    localStorage.removeItem('nexthire_user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('nexthire_access_token');
    if (!token) return;

    try {
      const res: any = await apiClient.get('/auth/me');
      const user = res.data;
      localStorage.setItem('nexthire_user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    } catch (err) {
      localStorage.removeItem('nexthire_access_token');
      localStorage.removeItem('nexthire_user');
      set({ user: null, token: null, isAuthenticated: false });
    }
  }
}));
