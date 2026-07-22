import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLoginForm } from '../features/auth/components/GoogleLoginForm';
import { Terminal, Shield } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-on-surface">
      <div className="w-full max-w-md bg-white border border-outline-variant rounded-3xl p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-primary-container text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Terminal className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-primary">NextHire Platform</h1>
          <p className="text-xs text-on-surface-variant">Sign in with Google OAuth to access candidate features or admin tools.</p>
        </div>

        <GoogleLoginForm onSuccess={() => navigate('/contests')} />
      </div>
    </div>
  );
};
