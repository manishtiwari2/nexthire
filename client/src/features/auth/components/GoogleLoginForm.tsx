import React, { useState } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { Button } from '../../../shared/components/ui/Button';
import { Input } from '../../../shared/components/ui/Input';
import { Shield, Sparkles, UserCheck, ArrowRight } from 'lucide-react';

interface GoogleLoginFormProps {
  onSuccess?: () => void;
}

export const GoogleLoginForm: React.FC<GoogleLoginFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('alex@nexthire.dev');
  const [name, setName] = useState('Alex Rivera');
  const [isSimulatingGoogle, setIsSimulatingGoogle] = useState(false);
  const { loginWithGoogle, isLoading } = useAuthStore();
  const { addToast } = useNotificationStore();

  const handleGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loginWithGoogle(email, name, `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`);
      addToast('Authentication Success', `Logged in as ${email}`, 'success');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      addToast('Auth Error', String(err), 'error');
    }
  };

  const handleQuickFill = (targetEmail: string, targetName: string) => {
    setEmail(targetEmail);
    setName(targetName);
  };

  return (
    <div className="space-y-6">
      {/* Official Google OAuth Trigger Button */}
      <button
        onClick={() => setIsSimulatingGoogle(!isSimulatingGoogle)}
        type="button"
        className="w-full py-3 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl shadow-sm flex items-center justify-center gap-3 transition-all active:scale-95 text-xs"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        <span>Sign in with Google OAuth</span>
      </button>

      {/* Google Account Selector & Presets */}
      <form onSubmit={handleGoogleSubmit} className="space-y-4 pt-2 border-t border-slate-100">
        <Input
          label="Google Email Account"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />

        <Input
          label="Display Name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex Rivera"
        />

        <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
          <span>Authenticate & Continue</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </form>

      {/* Required Role Assignment Presets */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
        <div className="font-bold text-slate-700 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Admin & Candidate Test Accounts:
        </div>

        <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200">
          <div>
            <span className="font-bold text-purple-700 text-[11px] bg-purple-50 px-1.5 py-0.5 rounded flex items-center gap-1 w-max mb-0.5">
              <Shield className="w-3 h-3" /> ADMIN ROLE
            </span>
            <p className="text-[11px] text-slate-600 font-mono">anuradha@admin.at</p>
          </div>
          <button
            type="button"
            onClick={() => handleQuickFill('anuradha@admin.at', 'Anuradha Admin')}
            className="text-[11px] text-purple-700 font-bold hover:underline"
          >
            Use Account
          </button>
        </div>

        <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200">
          <div>
            <span className="font-bold text-purple-700 text-[11px] bg-purple-50 px-1.5 py-0.5 rounded flex items-center gap-1 w-max mb-0.5">
              <Shield className="w-3 h-3" /> ADMIN ROLE
            </span>
            <p className="text-[11px] text-slate-600 font-mono">manish@admin.mt</p>
          </div>
          <button
            type="button"
            onClick={() => handleQuickFill('manish@admin.mt', 'Manish Admin')}
            className="text-[11px] text-purple-700 font-bold hover:underline"
          >
            Use Account
          </button>
        </div>

        <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200">
          <div>
            <span className="font-bold text-blue-700 text-[11px] bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-1 w-max mb-0.5">
              <UserCheck className="w-3 h-3" /> CANDIDATE ROLE
            </span>
            <p className="text-[11px] text-slate-600 font-mono">alex@nexthire.dev</p>
          </div>
          <button
            type="button"
            onClick={() => handleQuickFill('alex@nexthire.dev', 'Alex Rivera')}
            className="text-[11px] text-blue-600 font-bold hover:underline"
          >
            Use Account
          </button>
        </div>
      </div>
    </div>
  );
};
