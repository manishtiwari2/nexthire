import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/useAuthStore';
import { ToastContainer } from './components/layout/ToastContainer';
import { ProtectedRoute } from './components/common/ProtectedRoute';

const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const QuestionBankPage = React.lazy(() => import('./pages/QuestionBankPage').then(m => ({ default: m.QuestionBankPage })));
const LivePracticePage = React.lazy(() => import('./pages/LivePracticePage').then(m => ({ default: m.LivePracticePage })));
const ContestsPage = React.lazy(() => import('./pages/ContestsPage').then(m => ({ default: m.ContestsPage })));
const LiveContestIDEPage = React.lazy(() => import('./pages/LiveContestIDEPage').then(m => ({ default: m.LiveContestIDEPage })));
const ForbiddenPage = React.lazy(() => import('./pages/ForbiddenPage').then(m => ({ default: m.ForbiddenPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

export const App: React.FC = () => {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="relative min-h-screen bg-surface font-sans text-on-background">
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/403" element={<ForbiddenPage />} />

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/contests" replace />} />
                <Route path="/contests" element={<ContestsPage />} />
                <Route path="/contest/:id" element={<LiveContestIDEPage />} />
                <Route path="/questions" element={<QuestionBankPage />} />
                <Route path="/questions/:id" element={<LivePracticePage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/contests" replace />} />
            </Routes>
          </React.Suspense>

          {/* Toast Notification Popups */}
          <ToastContainer />
        </div>
      </Router>
    </QueryClientProvider>
  );
};

export default App;
