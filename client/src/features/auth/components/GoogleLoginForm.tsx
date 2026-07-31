import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { Button, Input } from '../../../shared/components/ui';
import { ArrowRight } from 'lucide-react';

interface GoogleLoginFormProps {
  onSuccess?: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

const GoogleIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

export const GoogleLoginForm: React.FC<GoogleLoginFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);

  const { loginWithGoogle, login, isLoading } = useAuthStore();
  const { addToast } = useNotificationStore();

  // Load Google Identity Services SDK script dynamically if client ID is configured
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    if (window.google?.accounts?.id) {
      setGisLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setGisLoaded(true);
    };
    document.body.appendChild(script);
  }, []);

  // Initialize Google OAuth credential handler
  const handleGoogleOAuth = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (clientId && window.google?.accounts?.id) {
      setIsGoogleLoading(true);
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          try {
            await loginWithGoogle({ credential: response.credential });
            addToast('Authentication Success', 'Signed in with Google', 'success');
            if (onSuccess) onSuccess();
          } catch (err: any) {
            addToast('Authentication Failed', String(err), 'error');
          } finally {
            setIsGoogleLoading(false);
          }
        },
      });

      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setIsGoogleLoading(false);
        }
      });
    } else {
      // If no VITE_GOOGLE_CLIENT_ID is set in environment, prompt for direct account sign-in
      addToast('Google OAuth Config', 'Enter your Google account email below to authenticate with the backend DB.', 'info');
    }
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      addToast('Validation Error', 'Email is required', 'warning');
      return;
    }

    try {
      await loginWithGoogle({
        email,
        name: name || email.split('@')[0],
        avatarUrl: `https://api.dicebear.com/7.x/glass/svg?seed=${encodeURIComponent(email)}`,
      });
      addToast('Authentication Success', `Signed in as ${email}`, 'success');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      addToast('Authentication Failed', String(err), 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Google OAuth trigger */}
      <Button
        type="button"
        variant="secondary"
        fullWidth
        size="lg"
        onClick={handleGoogleOAuth}
        isLoading={isGoogleLoading}
        disabled={isLoading || isGoogleLoading}
        leftIcon={<GoogleIcon />}
      >
        Sign in with Google
      </Button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-outline-variant" />
        </div>
        <span className="relative bg-surface-container-lowest px-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Or continue with email
        </span>
      </div>

      {/* Direct backend auth */}
      <form onSubmit={handleDirectSubmit} className="space-y-4">
        <Input
          label="Account Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your.name@company.com"
        />
        <Input
          label="Display Name"
          hint="Optional — defaults to your email handle."
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First & Last name"
        />
        <Button
          type="submit"
          fullWidth
          size="lg"
          isLoading={isLoading}
          disabled={isLoading || isGoogleLoading || !email.trim()}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Sign in to account
        </Button>
      </form>
    </div>
  );
};
