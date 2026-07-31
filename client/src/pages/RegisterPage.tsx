import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Terminal, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';
import { Button, Card, Input, Alert } from '../shared/components/ui';

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Role is assigned server-side (by email) — the client never chooses its own role.
      await register(name, email, password, 'CANDIDATE');
      navigate('/contests');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Failed to register account');
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-on-surface flex items-center justify-center p-4 sm:p-6">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-elev-2">
            <Terminal className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">Create your NextHire account</h1>
            <p className="text-sm text-on-surface-variant">
              Join 50,000+ developers mastering technical interviews.
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              required
              icon={<UserIcon className="h-4 w-4" />}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah Jenkins"
            />

            <Input
              label="Email Address"
              type="email"
              required
              icon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@example.com"
            />

            <Input
              label="Password"
              type="password"
              required
              icon={<Lock className="h-4 w-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button
              type="submit"
              isLoading={isLoading}
              disabled={isLoading}
              fullWidth
              size="lg"
              rightIcon={<ArrowRight className="h-4 w-4" />}
              className="mt-2"
            >
              {isLoading ? 'Creating Account...' : 'Register Account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-on-surface-variant">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
