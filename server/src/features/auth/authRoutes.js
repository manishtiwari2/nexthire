const express = require('express');
const controller = require('./authController');
const admin = require('./adminUserController');
const { requireAuthenticated, requirePermission } = require('./authMiddleware');
const { requireCsrfToken } = require('./cookies');
const { rateLimit } = require('../../shared/rateLimit');
const {
  validate,
  registerSchema,
  loginSchema,
  googleCredentialSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  changePasswordSchema,
  updateProfileSchema,
  adminListUsersSchema,
  adminSetActiveSchema,
} = require('./authValidators');

const router = express.Router();

/**
 * Rate limits.
 *
 * Keyed by IP, with the credential-bearing endpoints also keyed by the email being
 * targeted so one attacker cannot burn through every user's allowance from one address,
 * and a shared NAT cannot lock out an office. The per-account lockout in the login flow is
 * the second layer.
 */
const ipKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const ipEmailKey = (req) => `${ipKey(req)}|${String(req.body?.email || '').toLowerCase()}`;

const loginLimiter = rateLimit({
  name: 'auth:login',
  limit: 10,
  windowSec: 300,
  keyGenerator: ipEmailKey,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

const registerLimiter = rateLimit({
  name: 'auth:register',
  limit: 5,
  windowSec: 3600,
  keyGenerator: ipKey,
  message: 'Too many accounts created from this network. Please try again later.',
});

/**
 * Signup traffic that never reaches account creation (a mistyped email, a password that
 * fails the policy) must not consume the hourly signup budget — otherwise a single user
 * fumbling the form is locked out for an hour, and a whole office behind one NAT with them.
 *
 * So the limiter runs *after* validation: only well-formed attempts count. Volume is still
 * bounded, because a malformed request costs nothing but a schema parse.
 */
const registerGuard = [validate(registerSchema), registerLimiter];

// Tight: each request sends an email, so this is abuse-prevention for our mail reputation
// as much as for the user's inbox.
const emailLimiter = rateLimit({
  name: 'auth:email',
  limit: 5,
  windowSec: 900,
  keyGenerator: ipEmailKey,
  message: 'Too many requests for that address. Please wait 15 minutes.',
});

const resetLimiter = rateLimit({
  name: 'auth:reset',
  limit: 10,
  windowSec: 900,
  keyGenerator: ipKey,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const refreshLimiter = rateLimit({
  name: 'auth:refresh',
  limit: 60,
  windowSec: 300,
  keyGenerator: ipKey,
  message: 'Too many session refreshes. Please try again shortly.',
});

const googleLimiter = rateLimit({
  name: 'auth:google',
  limit: 20,
  windowSec: 300,
  keyGenerator: ipKey,
  message: 'Too many Google sign-in attempts. Please try again shortly.',
});

// Its own bucket, so exhausting one provider's allowance does not take the other down with
// it — a user who cannot get past Google should still be able to try GitHub.
const githubLimiter = rateLimit({
  name: 'auth:github',
  limit: 20,
  windowSec: 300,
  keyGenerator: ipKey,
  message: 'Too many GitHub sign-in attempts. Please try again shortly.',
});

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** What the sign-in page needs to know (is Google enabled, password policy, …). */
router.get('/config', controller.getAuthConfig);

router.post('/register', ...registerGuard, controller.register);
router.post('/login', loginLimiter, validate(loginSchema), controller.login);

router.post('/verify-email', resetLimiter, validate(verifyEmailSchema), controller.verifyEmail);
router.post('/resend-verification', emailLimiter, validate(resendVerificationSchema), controller.resendVerification);

router.post('/forgot-password', emailLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', resetLimiter, validate(resetPasswordSchema), controller.resetPassword);

// Google — GIS credential (ID token) flow.
router.post('/google', googleLimiter, validate(googleCredentialSchema), controller.googleLogin);
// Google — authorization-code flow. Browser navigations, not XHR.
router.get('/google/start', googleLimiter, controller.googleStart);
router.get('/google/callback', controller.googleCallback);

/**
 * GitHub — authorization-code flow only. GitHub is not an OpenID Connect provider, so there
 * is no ID token and therefore no `POST /auth/github` counterpart to `POST /auth/google`:
 * the code exchange and the profile read both happen server-side.
 */
router.get('/github/start', githubLimiter, controller.githubStart);
router.get('/github/callback', controller.githubCallback);

/**
 * Cookie-authenticated. CSRF-protected because the browser attaches the refresh cookie
 * automatically and these are state-changing.
 */
router.post('/refresh', refreshLimiter, requireCsrfToken, controller.refresh);
router.post('/logout', requireCsrfToken, controller.logout);

// ---------------------------------------------------------------------------
// Authenticated
// ---------------------------------------------------------------------------

router.get('/me', requireAuthenticated, controller.getMe);
router.post('/logout-all', requireAuthenticated, controller.logoutAll);

router.get('/sessions', requireAuthenticated, controller.listSessions);
router.delete('/sessions/:id', requireAuthenticated, controller.revokeSession);
router.get('/security-events', requireAuthenticated, controller.getSecurityEvents);

router.patch(
  '/profile',
  requireAuthenticated,
  requirePermission('profile:manage'),
  validate(updateProfileSchema),
  controller.updateProfile
);
router.post(
  '/change-password',
  requireAuthenticated,
  resetLimiter,
  validate(changePasswordSchema),
  controller.changePassword
);
router.post('/google/unlink', requireAuthenticated, controller.unlinkGoogle);
router.post('/github/unlink', requireAuthenticated, controller.unlinkGithub);

// ---------------------------------------------------------------------------
// Admin — user management
// ---------------------------------------------------------------------------

const adminOnly = [requireAuthenticated, requirePermission('user:manage')];

router.get('/admin/users', ...adminOnly, validate(adminListUsersSchema, 'query'), admin.listUsers);
router.get('/admin/users/:id', ...adminOnly, admin.getUser);
router.get('/admin/users/:id/login-history', ...adminOnly, admin.getLoginHistory);
router.patch('/admin/users/:id/status', ...adminOnly, validate(adminSetActiveSchema), admin.setUserStatus);
router.post('/admin/users/:id/reset-password', ...adminOnly, admin.sendPasswordReset);
router.post('/admin/users/:id/unlock', ...adminOnly, admin.unlockUser);
router.post('/admin/users/:id/revoke-sessions', ...adminOnly, admin.revokeUserSessions);
router.get(
  '/admin/analytics',
  requireAuthenticated,
  requirePermission('analytics:read'),
  admin.getAuthAnalytics
);

module.exports = router;
