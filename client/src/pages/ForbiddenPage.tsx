import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-10 h-10 text-red-600" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-on-surface">403</h1>
          <h2 className="text-xl font-bold text-on-surface mt-2">Access Forbidden</h2>
          <p className="text-sm text-on-surface-variant mt-2">
            You don't have permission to access this page. Contact an administrator if you believe this is an error.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
};
