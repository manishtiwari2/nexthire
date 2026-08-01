import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/useAuthStore';
import { ToastContainer } from './components/layout/ToastContainer';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { PageLoader } from './shared/components/ui';

const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const QuestionBankPage = React.lazy(() => import('./pages/QuestionBankPage').then(m => ({ default: m.QuestionBankPage })));
const LivePracticePage = React.lazy(() => import('./pages/LivePracticePage').then(m => ({ default: m.LivePracticePage })));
const ContestsPage = React.lazy(() => import('./pages/ContestsPage').then(m => ({ default: m.ContestsPage })));
const LiveContestIDEPage = React.lazy(() => import('./pages/LiveContestIDEPage').then(m => ({ default: m.LiveContestIDEPage })));
const AdminCreateContestPage = React.lazy(() => import('./pages/AdminCreateContestPage').then(m => ({ default: m.AdminCreateContestPage })));
const AdminCreateQuestionPage = React.lazy(() => import('./pages/AdminCreateQuestionPage').then(m => ({ default: m.AdminCreateQuestionPage })));
const ForbiddenPage = React.lazy(() => import('./pages/ForbiddenPage').then(m => ({ default: m.ForbiddenPage })));
const LibraryPage = React.lazy(() => import('./pages/LibraryPage').then(m => ({ default: m.LibraryPage })));
const StudySheetsPage = React.lazy(() => import('./pages/StudySheetsPage').then(m => ({ default: m.StudySheetsPage })));
const StudySheetDetailPage = React.lazy(() => import('./pages/StudySheetDetailPage').then(m => ({ default: m.StudySheetDetailPage })));
const PracticePage = React.lazy(() => import('./pages/PracticePage').then(m => ({ default: m.PracticePage })));
const ProgressPage = React.lazy(() => import('./pages/ProgressPage').then(m => ({ default: m.ProgressPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const RevisionPage = React.lazy(() => import('./pages/RevisionPage').then(m => ({ default: m.RevisionPage })));

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
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="relative min-h-screen bg-background text-on-surface">
          <React.Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/403" element={<ForbiddenPage />} />

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/contests" element={<ContestsPage />} />
                <Route path="/contest/:id" element={<LiveContestIDEPage />} />
                <Route path="/admin/contests/create" element={<AdminCreateContestPage />} />
                <Route path="/admin/questions/create" element={<AdminCreateQuestionPage />} />
                <Route path="/questions" element={<QuestionBankPage />} />
                <Route path="/questions/:id" element={<LivePracticePage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/sheets" element={<StudySheetsPage />} />
                <Route path="/sheets/:slug" element={<StudySheetDetailPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/revision" element={<RevisionPage />} />
                <Route path="/progress" element={<ProgressPage />} />
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
