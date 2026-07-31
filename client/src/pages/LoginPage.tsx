import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLoginForm } from '../features/auth/components/GoogleLoginForm';
import { Terminal } from 'lucide-react';
import { Card } from '../shared/components/ui';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-background text-on-surface flex items-center justify-center p-4 sm:p-6">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-elev-2">
            <Terminal className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">NextHire</h1>
            <p className="text-sm text-on-surface-variant">
              Sign in with Google OAuth to access candidate features or admin tools.
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <GoogleLoginForm onSuccess={() => navigate('/contests')} />
        </Card>
      </div>
    </div>
  );
};
