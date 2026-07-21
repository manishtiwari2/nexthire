import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/useAuthStore';
import { ToastContainer } from './components/layout/ToastContainer';
import { ProtectedRoute } from './components/common/ProtectedRoute';

const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const QuestionBankPage = React.lazy(() => import('./pages/QuestionBankPage').then(m => ({ default: m.QuestionBankPage })));
const LivePracticePage = React.lazy(() => import('./pages/LivePracticePage').then(m => ({ default: m.LivePracticePage })));
const ContestsPage = React.lazy(() => import('./pages/ContestsPage').then(m => ({ default: m.ContestsPage })));
const LiveContestIDEPage = React.lazy(() => import('./pages/LiveContestIDEPage').then(m => ({ default: m.LiveContestIDEPage })));
const InterviewsPage = React.lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.InterviewsPage })));
const WaitingRoomPage = React.lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.WaitingRoomPage })));
const LiveInterviewSessionPage = React.lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.LiveInterviewSessionPage })));
const InterviewReportPage = React.lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.InterviewReportPage })));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const AdminSuitePage = React.lazy(() => import('./pages/AdminSuitePage').then(m => ({ default: m.AdminSuitePage })));
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

              {/* Candidate Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/questions" element={<QuestionBankPage />} />
                <Route path="/questions/:id" element={<LivePracticePage />} />
                <Route path="/contests" element={<ContestsPage />} />
                <Route path="/contest/:id" element={<LiveContestIDEPage />} />
                <Route path="/interviews" element={<InterviewsPage />} />
                <Route path="/interview/waiting-room" element={<WaitingRoomPage />} />
                <Route path="/interview/live" element={<LiveInterviewSessionPage />} />
                <Route path="/interview/report" element={<InterviewReportPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings/editor" element={<ProfilePage />} />
                <Route path="/notifications" element={<DashboardPage />} />
              </Route>

              {/* Admin Protected Routes */}
              <Route element={<ProtectedRoute requiredRole="ADMIN" />}>
                <Route path="/admin/questions" element={<AdminSuitePage />} />
                <Route path="/admin/contests" element={<AdminSuitePage />} />
                <Route path="/admin/contests/create" element={<AdminSuitePage />} />
                <Route path="/admin/interviews/create" element={<AdminSuitePage />} />
                <Route path="/admin/system-communication" element={<AdminSuitePage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
