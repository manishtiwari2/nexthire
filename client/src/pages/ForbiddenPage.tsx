import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../shared/components/ui';

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-background text-on-surface flex items-center justify-center p-4 sm:p-6">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <div className="relative max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-danger/25 bg-danger-container text-on-danger-container">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <p className="text-5xl font-black tracking-tight text-on-surface">403</p>
          <h1 className="text-xl font-bold text-on-surface">Access Forbidden</h1>
          <p className="text-sm text-on-surface-variant">
            You don't have permission to access this page. Contact an administrator if you believe this is an error.
          </p>
        </div>
        <Link to="/contests" className="inline-block">
          <Button size="lg" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Return to Assessments
          </Button>
        </Link>
      </div>
    </div>
  );
};
