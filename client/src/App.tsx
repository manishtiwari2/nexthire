import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/useAuthStore';
import { ToastContainer } from './components/layout/ToastContainer';
import {
  ProtectedRoute,
  PublicOnlyRoute,
  VerifyEmailRequiredPage,
} from './components/common/ProtectedRoute';
import { PageLoader } from './shared/components/ui';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// ---- Auth pages ----
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = React.lazy(() => import('./pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const OAuthCallbackPage = React.lazy(() => import('./pages/OAuthCallbackPage').then(m => ({ default: m.OAuthCallbackPage })));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const AdminUsersPage = React.lazy(() => import('./pages/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));

// ---- App pages ----
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

/**
 * Bootstraps the session before rendering routes.
 *
 * The access token is held in memory only, so a page reload starts with nothing. This calls
 * `/auth/refresh` once — the HTTP-only cookie is still present, so the session is restored
 * without the client ever having persisted a credential. Guards render a loader while
 * `status === 'bootstrapping'`, which is why a hard refresh no longer flashes /login.
 */
const AuthBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const loadServerConfig = useAuthStore((state) => state.loadServerConfig);

  useEffect(() => {
    void bootstrap();
    // Fetched here rather than per-page so the Google button never waits on it.
    void loadServerConfig();
  }, [bootstrap, loadServerConfig]);

  return <>{children}</>;
};

export const App: React.FC = () => (
  // The boundary is outermost so a crash in any page — or in the router itself — shows a
  // message rather than a blank screen.
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Router>
      <AuthBootstrap>
        <div className="relative min-h-screen bg-background text-on-surface">
          <React.Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ---- Public, signed-out only ---- */}
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>

              {/* ---- Public, reachable in any auth state ---- */}
              {/* Verification links must work whether or not the browser is signed in. */}
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/auth/callback" element={<OAuthCallbackPage />} />
              <Route path="/403" element={<ForbiddenPage />} />

              {/* Signed in but unverified — the interstitial that offers a resend. */}
              <Route path="/verify-email-required" element={<VerifyEmailRequiredPage />} />

              {/*
                Authenticated. `requireVerified={false}` on the profile so an unverified
                user can still reach their account settings (and resend the link) instead of
                being trapped with no way forward.
              */}
              <Route element={<ProtectedRoute requireVerified={false} />}>
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              {/* Authenticated + verified — the app proper. */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/contests" element={<ContestsPage />} />
                <Route path="/contest/:id" element={<LiveContestIDEPage />} />
                <Route path="/questions" element={<QuestionBankPage />} />
                <Route path="/questions/:id" element={<LivePracticePage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/sheets" element={<StudySheetsPage />} />
                <Route path="/sheets/:slug" element={<StudySheetDetailPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/revision" element={<RevisionPage />} />
                <Route path="/progress" element={<ProgressPage />} />
              </Route>

              {/* ---- Admin ---- */}
              {/* Guarded by capability, not role, so the matrix in shared/authz.js stays
                  the single source of truth for who may do what. */}
              <Route element={<ProtectedRoute permission="user:manage" />}>
                <Route path="/admin/users" element={<AdminUsersPage />} />
              </Route>
              <Route element={<ProtectedRoute permission="question:manage" />}>
                <Route path="/admin/questions/create" element={<AdminCreateQuestionPage />} />
              </Route>
              <Route element={<ProtectedRoute permission="contest:manage" />}>
                <Route path="/admin/contests/create" element={<AdminCreateContestPage />} />
              </Route>

              {/* ---- Fallback ---- */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </React.Suspense>

          {/* Toast Notification Popups */}
          <ToastContainer />
        </div>
        </AuthBootstrap>
      </Router>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
