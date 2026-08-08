const { prisma } = require('../../shared/db');
const { authConfig, roleForEmail } = require('./authConfig');
const { ROLES, normalizeRole } = require('../../shared/authz');
const { hashPassword, verifyPassword, fakeVerifyDelay } = require('./passwordService');
const { signAccessToken, createEmailToken, hashToken } = require('./tokenService');
const sessionService = require('./sessionService');
const { describeRequest } = require('./requestContext');
const { setAuthCookies, clearAuthCookies, readRefreshToken } = require('./cookies');
const { toUserDto } = require('./userDto');
const { track, listUserEvents } = require('./auditService');
const mailer = require('./mailService');
const google = require('./googleService');
const rateLimiter = require('../../shared/rateLimit');

/**
 * Authentication endpoints.
 *
 * Response shape is uniform: `{ success, data }` or `{ success, error, code, fields? }`.
 * The `code` is what the client branches on — messages are for humans and may change.
 *
 * Two invariants worth stating up front:
 *  • The client never chooses its own role. Roles are derived from the configured admin
 *    email list (or set by an admin), never read from the request body.
 *  • Nothing about a user is trusted from the request. Google profile data comes from a
 *    server-verified ID token; email/password identity comes from the database.
 */

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Whether login may say "no account with that email" instead of a generic message.
 * Distinguishing the two is a user-enumeration oracle, so it is off in production and on
 * in development, where the precise message is worth far more than the secrecy.
 * Forgot-password never distinguishes, in any environment.
 */
const VERBOSE_LOGIN_ERRORS =
  process.env.AUTH_VERBOSE_LOGIN_ERRORS === 'true' ||
  (IS_DEV && process.env.AUTH_VERBOSE_LOGIN_ERRORS !== 'false');

const EMAIL_VERIFICATION_REQUIRED = process.env.EMAIL_VERIFICATION_REQUIRED !== 'false';

function fail(res, status, code, error, extra = {}) {
  return res.status(status).json({ success: false, error, code, ...extra });
}

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function defaultAvatar(email) {
  return `https://api.dicebear.com/7.x/glass/svg?seed=${encodeURIComponent(email)}`;
}

/**
 * The role a user should have right now.
 *
 * The configured admin list is authoritative in both directions: emails on it are ADMIN,
 * and an ADMIN whose email has been removed from it is demoted. Any other role
 * (USER / INTERVIEWER) is left alone so an admin-assigned INTERVIEWER survives login.
 */
function reconcileRole(user) {
  const entitled = roleForEmail(user.email);
  const current = normalizeRole(user.role);

  if (entitled === ROLES.ADMIN) return ROLES.ADMIN;
  if (current === ROLES.ADMIN) return ROLES.USER;
  return current;
}

/**
 * Establish a session: create the row, set the HTTP-only refresh cookie + CSRF cookie,
 * and return the access token. The refresh token itself is never in a response body.
 */
async function issueSession(req, res, user, { provider, rememberMe }) {
  const context = describeRequest(req);
  const { session, refreshToken, ttlSec } = await sessionService.createSession({
    userId: user.id,
    provider,
    rememberMe,
    context,
  });

  setAuthCookies(res, refreshToken, { rememberMe, ttlSec });

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    tokenVersion: user.tokenVersion,
    sessionId: session.id,
  });

  return {
    accessToken,
    /** Seconds until the access token expires; the client refreshes just before this. */
    expiresIn: authConfig.accessTokenTtlSec,
    sessionId: session.id,
  };
}

/** Ensure a Profile row exists — several features assume one. Safe to call repeatedly. */
async function ensureProfile(userId) {
  await prisma.profile.upsert({ where: { userId }, create: { userId }, update: {} });
}

function isUniqueViolation(err, field) {
  return err?.code === 'P2002' && (!field || (err.meta?.target || []).some((t) => String(t).includes(field)));
}

// ===========================================================================
// Registration & email verification
// ===========================================================================

/**
 * POST /auth/register
 *
 * Creates the account and emails a verification link. Deliberately does *not* sign the
 * user in — the account is inert until the email is confirmed (see `login`). Duplicate
 * email/mobile are reported as field errors because the user needs to know which one
 * collided; this is a registration form, where an enumeration-proof "check your email"
 * would make the form unusable.
 */
async function register(req, res, next) {
  const context = describeRequest(req);
  try {
    const { name, email, mobile, password } = req.body;

    const [emailTaken, mobileTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { mobile } }),
    ]);

    const fields = {};
    if (emailTaken) fields.email = 'An account with this email already exists';
    if (mobileTaken) fields.mobile = 'An account with this mobile number already exists';
    if (Object.keys(fields).length) {
      return fail(res, 409, 'ALREADY_EXISTS', 'Please correct the highlighted fields', { fields });
    }

    const passwordHash = await hashPassword(password);
    const role = roleForEmail(email);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          mobile,
          passwordHash,
          passwordChangedAt: new Date(),
          role,
          avatarUrl: defaultAvatar(email),
          emailVerified: false,
          // Legacy column: keep it in step with emailVerified for older readers.
          isVerified: false,
        },
      });
    } catch (err) {
      // Lost a race with a concurrent signup on the same email/mobile.
      if (isUniqueViolation(err)) {
        const conflictFields = {};
        if (isUniqueViolation(err, 'email')) conflictFields.email = 'An account with this email already exists';
        if (isUniqueViolation(err, 'mobile')) conflictFields.mobile = 'An account with this mobile number already exists';
        return fail(res, 409, 'ALREADY_EXISTS', 'Please correct the highlighted fields', {
          fields: conflictFields,
        });
      }
      throw err;
    }

    await ensureProfile(user.id);

    const { token, tokenHash, expiresAt } = createEmailToken(authConfig.emailVerificationTtlSec);
    await prisma.authToken.create({
      data: { userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash, expiresAt },
    });

    await mailer.sendVerificationEmail({ to: user.email, name: user.name, token });

    track({
      type: 'REGISTER',
      userId: user.id,
      email: user.email,
      provider: 'PASSWORD',
      ...context,
    });

    return ok(
      res,
      {
        user: toUserDto(user),
        emailVerificationRequired: EMAIL_VERIFICATION_REQUIRED,
        message: `Account created. We sent a verification link to ${user.email}.`,
        // Development convenience: surface the link in the API response so the flow can be
        // completed without a mail server. Never included in production.
        ...(IS_DEV
          ? { devVerificationUrl: `${authConfig.clientUrl}/verify-email?token=${encodeURIComponent(token)}` }
          : {}),
      },
      201
    );
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/verify-email
 *
 * Consumes a single-use token. Idempotent for an already-verified user so a double-click
 * on the emailed link shows success rather than a confusing failure.
 */
async function verifyEmail(req, res, next) {
  const context = describeRequest(req);
  try {
    const { token } = req.body;
    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!record || record.type !== 'EMAIL_VERIFICATION') {
      return fail(res, 400, 'TOKEN_INVALID', 'This verification link is not valid. Request a new one.');
    }
    if (record.user.emailVerified) {
      return ok(res, { alreadyVerified: true, message: 'Your email address is already verified.' });
    }
    if (record.usedAt) {
      return fail(res, 400, 'TOKEN_USED', 'This verification link has already been used. Request a new one.');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      return fail(res, 400, 'TOKEN_EXPIRED', 'This verification link has expired. Request a new one.');
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, emailVerifiedAt: now, isVerified: true },
      }),
      // Any other outstanding verification tokens are now moot.
      prisma.authToken.updateMany({
        where: { userId: record.userId, type: 'EMAIL_VERIFICATION', usedAt: null },
        data: { usedAt: now },
      }),
    ]);

    track({
      type: 'EMAIL_VERIFIED',
      userId: record.userId,
      email: record.user.email,
      ...context,
    });

    return ok(res, { verified: true, message: 'Email verified. You can sign in now.' });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/resend-verification
 *
 * Always reports success: whether an address is registered (and whether it is already
 * verified) is not information this endpoint should hand out.
 */
async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    const genericResponse = {
      message: 'If that address needs verification, a new link is on its way.',
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) return ok(res, genericResponse);

    // Invalidate previous links so only the newest one works.
    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION', usedAt: null },
      data: { usedAt: new Date() },
    });

    const { token, tokenHash, expiresAt } = createEmailToken(authConfig.emailVerificationTtlSec);
    await prisma.authToken.create({
      data: { userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash, expiresAt },
    });
    await mailer.sendVerificationEmail({ to: user.email, name: user.name, token });

    return ok(res, {
      ...genericResponse,
      ...(IS_DEV
        ? { devVerificationUrl: `${authConfig.clientUrl}/verify-email?token=${encodeURIComponent(token)}` }
        : {}),
    });
  } catch (err) {
    return next(err);
  }
}

// ===========================================================================
// Password login
// ===========================================================================

/**
 * POST /auth/login
 *
 * Order of checks matters. Lockout and disabled-account are reported before the password
 * is even considered, so a locked account cannot be probed by password. Verification is
 * checked *after* the password succeeds — otherwise the endpoint would confirm which
 * addresses are registered to anyone who guesses one.
 */
async function login(req, res, next) {
  const context = describeRequest(req);
  const { email, password, rememberMe } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Spend the same time as a real bcrypt comparison so response latency does not
      // reveal that the account is missing.
      await fakeVerifyDelay();
      track({ type: 'LOGIN_FAILED', email, provider: 'PASSWORD', detail: 'unknown_email', ...context });
      return fail(
        res,
        401,
        'INVALID_CREDENTIALS',
        VERBOSE_LOGIN_ERRORS ? 'No account found with this email address' : 'Invalid email or password'
      );
    }

    if (!user.isActive) {
      track({
        type: 'LOGIN_FAILED',
        userId: user.id,
        email,
        provider: 'PASSWORD',
        detail: 'account_disabled',
        ...context,
      });
      return fail(
        res,
        403,
        'ACCOUNT_DISABLED',
        user.disabledReason
          ? `This account has been disabled: ${user.disabledReason}`
          : 'This account has been disabled. Contact an administrator.'
      );
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfterSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      return fail(
        res,
        423,
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
        { retryAfterSec }
      );
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);

    if (!passwordOk) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= authConfig.maxFailedLoginAttempts;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + authConfig.loginLockoutSec * 1000) : null,
        },
      });

      track({
        type: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        userId: user.id,
        email,
        provider: 'PASSWORD',
        detail: user.passwordHash ? 'invalid_password' : 'no_password_set',
        ...context,
      });

      if (shouldLock) {
        return fail(
          res,
          423,
          'ACCOUNT_LOCKED',
          `Too many failed attempts. This account is locked for ${Math.ceil(authConfig.loginLockoutSec / 60)} minutes.`,
          { retryAfterSec: authConfig.loginLockoutSec }
        );
      }

      // A Google-only account has no password to be "wrong"; point the user at the
      // button that will actually work instead of letting them guess forever.
      if (!user.passwordHash) {
        return fail(
          res,
          401,
          'PASSWORD_NOT_SET',
          VERBOSE_LOGIN_ERRORS
            ? 'This account was created with Google. Sign in with Google, or use "Forgot password" to set a password.'
            : 'Invalid email or password'
        );
      }

      return fail(
        res,
        401,
        'INVALID_CREDENTIALS',
        VERBOSE_LOGIN_ERRORS ? 'Incorrect password' : 'Invalid email or password',
        { attemptsRemaining: Math.max(0, authConfig.maxFailedLoginAttempts - attempts) }
      );
    }

    if (EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
      // Clear the failure counter — the credentials were correct.
      if (user.failedLoginAttempts) {
        await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });
      }
      track({
        type: 'LOGIN_FAILED',
        userId: user.id,
        email,
        provider: 'PASSWORD',
        detail: 'email_not_verified',
        ...context,
      });
      return fail(
        res,
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email address before signing in. Check your inbox for the verification link.',
        { email: user.email, canResend: true }
      );
    }

    const role = reconcileRole(user);
    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        role,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: now,
        lastActive: now,
      },
    });

    await ensureProfile(updated.id);
    const tokens = await issueSession(req, res, updated, { provider: 'PASSWORD', rememberMe });

    // A successful sign-in clears the per-IP login bucket so one forgotten password does
    // not eat the allowance for the rest of the window.
    if (req.rateLimitKey) rateLimiter.reset(req.rateLimitKey);

    track({ type: 'LOGIN_SUCCESS', userId: updated.id, email, provider: 'PASSWORD', ...context });

    return ok(res, { ...tokens, user: toUserDto(updated) });
  } catch (err) {
    return next(err);
  }
}

// ===========================================================================
// Google OAuth
// ===========================================================================

/**
 * Find-or-create the local account behind a verified Google profile.
 *
 * Linking rule: if an account already exists with the same email, the Google identity is
 * attached to it. That is safe *only* because `verifyIdToken` rejects tokens whose
 * `email_verified` is not true — otherwise anyone could create a Google account claiming
 * someone else's address and inherit their NextHire account.
 */
async function upsertGoogleUser(profile, context) {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  const existing = byGoogleId || (await prisma.user.findUnique({ where: { email: profile.email } }));

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        googleId: profile.googleId,
        avatarUrl: profile.picture || defaultAvatar(profile.email),
        role: roleForEmail(profile.email),
        // Google has verified the address; there is nothing left for us to verify.
        emailVerified: true,
        emailVerifiedAt: new Date(),
        isVerified: true,
      },
    });
    await ensureProfile(created.id);
    track({
      type: 'REGISTER',
      userId: created.id,
      email: created.email,
      provider: 'GOOGLE',
      detail: 'created_via_google',
      ...context,
    });
    return { user: created, linked: false, created: true };
  }

  if (!existing.isActive) {
    const error = new Error('account_disabled');
    error.disabledUser = existing;
    throw error;
  }

  const linking = !existing.googleId;
  const now = new Date();

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      googleId: existing.googleId || profile.googleId,
      // Signing in with a verified Google identity settles email verification for an
      // account that registered by password and never confirmed.
      emailVerified: true,
      emailVerifiedAt: existing.emailVerifiedAt || now,
      isVerified: true,
      // Only fill the avatar in; never overwrite one the user chose.
      avatarUrl: existing.avatarUrl || profile.picture || defaultAvatar(existing.email),
      role: reconcileRole(existing),
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLogin: now,
      lastActive: now,
    },
  });

  await ensureProfile(updated.id);

  if (linking) {
    track({
      type: 'GOOGLE_LINKED',
      userId: updated.id,
      email: updated.email,
      provider: 'GOOGLE',
      detail: 'linked_on_sign_in',
      ...context,
    });
  }

  return { user: updated, linked: linking, created: false };
}

/**
 * POST /auth/google
 *
 * Google Identity Services flow: the client posts the `credential` (an ID token) it got
 * from the Google button. The token — not the client — is the source of truth for every
 * profile field.
 */
async function googleLogin(req, res, next) {
  const context = describeRequest(req);
  try {
    const { credential, rememberMe } = req.body;

    let profile;
    try {
      profile = await google.verifyIdToken(credential);
    } catch (err) {
      if (err instanceof google.GoogleAuthError) {
        track({ type: 'LOGIN_FAILED', provider: 'GOOGLE', detail: err.code, ...context });
        const status = err.code === 'GOOGLE_NOT_CONFIGURED' ? 503 : 401;
        return fail(res, status, err.code, err.message);
      }
      throw err;
    }

    let result;
    try {
      result = await upsertGoogleUser(profile, context);
    } catch (err) {
      if (err.message === 'account_disabled') {
        track({
          type: 'LOGIN_FAILED',
          userId: err.disabledUser.id,
          email: err.disabledUser.email,
          provider: 'GOOGLE',
          detail: 'account_disabled',
          ...context,
        });
        return fail(res, 403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact an administrator.');
      }
      throw err;
    }

    const tokens = await issueSession(req, res, result.user, { provider: 'GOOGLE', rememberMe });
    track({
      type: 'LOGIN_SUCCESS',
      userId: result.user.id,
      email: result.user.email,
      provider: 'GOOGLE',
      ...context,
    });

    return ok(res, {
      ...tokens,
      user: toUserDto(result.user),
      isNewAccount: result.created,
      accountLinked: result.linked,
    });
  } catch (err) {
    return next(err);
  }
}

const OAUTH_STATE_COOKIE = 'nh_oauth';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * GET /auth/google/start
 *
 * Authorization-code flow entry point. `state` (CSRF) and `nonce` (token replay) are
 * stored in a short-lived HTTP-only cookie and re-checked in the callback, so a forged
 * callback cannot complete a sign-in.
 */
function googleStart(req, res) {
  if (!authConfig.google.supportsCodeFlow) {
    return fail(
      res,
      503,
      'GOOGLE_NOT_CONFIGURED',
      'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
  }

  const { state, nonce } = google.createOAuthState();
  // Where to land in the app afterwards. Restricted to a relative path so this cannot be
  // turned into an open redirect.
  const requestedRedirect = typeof req.query.redirect === 'string' ? req.query.redirect : '';
  const safeRedirect = /^\/[^/\\]/.test(requestedRedirect) ? requestedRedirect : '/dashboard';
  const rememberMe = req.query.remember === 'true' || req.query.remember === '1';

  res.cookie(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, nonce, redirect: safeRedirect, rememberMe }),
    {
      httpOnly: true,
      secure: authConfig.cookies.secure,
      // The callback is a top-level cross-site GET from Google, so "lax" is required
      // (a "strict" cookie would not be sent and every callback would fail).
      sameSite: 'lax',
      domain: authConfig.cookies.domain,
      path: '/',
      maxAge: OAUTH_STATE_TTL_MS,
    }
  );

  return res.redirect(google.buildAuthUrl({ state, nonce }));
}

/**
 * GET /auth/google/callback
 *
 * Google redirects the browser here. Because this is a navigation and not an XHR, every
 * outcome ends in a redirect back into the SPA: `/auth/callback#...` on success (the
 * fragment keeps the short-lived access token out of server logs and Referer headers), or
 * `/login?error=...` on failure.
 */
async function googleCallback(req, res, next) {
  const context = describeRequest(req);
  const clearState = () =>
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: authConfig.cookies.secure,
      sameSite: 'lax',
      domain: authConfig.cookies.domain,
      path: '/',
    });

  const redirectWithError = (code, message) => {
    clearState();
    const params = new URLSearchParams({ error: code, error_description: message });
    return res.redirect(`${authConfig.clientUrl}/login?${params.toString()}`);
  };

  try {
    if (req.query.error) {
      // The user hit "Cancel" on Google's consent screen.
      return redirectWithError('GOOGLE_DENIED', 'Google sign-in was cancelled.');
    }

    let stored;
    try {
      stored = JSON.parse(req.cookies?.[OAUTH_STATE_COOKIE] || 'null');
    } catch {
      stored = null;
    }
    if (!stored?.state || !stored?.nonce) {
      return redirectWithError('OAUTH_STATE_MISSING', 'Your sign-in attempt expired. Please try again.');
    }
    if (req.query.state !== stored.state) {
      track({ type: 'LOGIN_FAILED', provider: 'GOOGLE', detail: 'oauth_state_mismatch', ...context });
      return redirectWithError('OAUTH_STATE_MISMATCH', 'Sign-in verification failed. Please try again.');
    }
    if (typeof req.query.code !== 'string' || !req.query.code) {
      return redirectWithError('GOOGLE_NO_CODE', 'Google did not return an authorization code.');
    }

    let profile;
    try {
      ({ profile } = await google.exchangeCode(req.query.code, { expectedNonce: stored.nonce }));
    } catch (err) {
      if (err instanceof google.GoogleAuthError) {
        track({ type: 'LOGIN_FAILED', provider: 'GOOGLE', detail: err.code, ...context });
        return redirectWithError(err.code, err.message);
      }
      throw err;
    }

    let result;
    try {
      result = await upsertGoogleUser(profile, context);
    } catch (err) {
      if (err.message === 'account_disabled') {
        return redirectWithError('ACCOUNT_DISABLED', 'This account has been disabled.');
      }
      throw err;
    }

    const tokens = await issueSession(req, res, result.user, {
      provider: 'GOOGLE',
      rememberMe: Boolean(stored.rememberMe),
    });

    track({
      type: 'LOGIN_SUCCESS',
      userId: result.user.id,
      email: result.user.email,
      provider: 'GOOGLE',
      detail: 'code_flow',
      ...context,
    });

    clearState();

    // Fragment, not query string: fragments are not sent to servers or logged, and the
    // SPA strips it from the URL as soon as it has read the token.
    const fragment = new URLSearchParams({
      access_token: tokens.accessToken,
      expires_in: String(tokens.expiresIn),
      redirect: stored.redirect || '/dashboard',
      ...(result.created ? { new_account: '1' } : {}),
    });
    return res.redirect(`${authConfig.clientUrl}/auth/callback#${fragment.toString()}`);
  } catch (err) {
    return next(err);
  }
}

// ===========================================================================
// Session lifecycle
// ===========================================================================

/**
 * POST /auth/refresh
 *
 * Rotates the refresh cookie and returns a new access token. CSRF-protected (see
 * cookies.js) because it authenticates by cookie alone. A replayed token revokes every
 * session for that user — see `sessionService.rotateSession`.
 */
async function refresh(req, res, next) {
  const context = describeRequest(req);
  try {
    const rawToken = readRefreshToken(req);
    if (!rawToken) {
      return fail(res, 401, 'NO_SESSION', 'No active session');
    }

    const rotated = await sessionService.rotateSession(rawToken, context);
    if (!rotated.ok) {
      clearAuthCookies(res);
      const messages = {
        reuse: 'Your session was reused from another device and has been closed for safety. Please sign in again.',
        expired: 'Your session has expired. Please sign in again.',
        not_found: 'Your session is no longer valid. Please sign in again.',
      };
      const codes = { reuse: 'SESSION_REUSE', expired: 'SESSION_EXPIRED', not_found: 'SESSION_INVALID' };
      return fail(res, 401, codes[rotated.reason], messages[rotated.reason]);
    }

    const user = await prisma.user.findUnique({ where: { id: rotated.session.userId } });
    if (!user || !user.isActive) {
      await sessionService.revokeSessionById(rotated.session.id, rotated.session.userId, 'account_unavailable');
      clearAuthCookies(res);
      return fail(
        res,
        403,
        user ? 'ACCOUNT_DISABLED' : 'USER_NOT_FOUND',
        user ? 'This account has been disabled.' : 'Account no longer exists'
      );
    }

    setAuthCookies(res, rotated.refreshToken, {
      rememberMe: rotated.session.rememberMe,
      ttlSec: rotated.ttlSec,
    });

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      tokenVersion: user.tokenVersion,
      sessionId: rotated.session.id,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } });

    return ok(res, {
      accessToken,
      expiresIn: authConfig.accessTokenTtlSec,
      sessionId: rotated.session.id,
      user: toUserDto(user),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/logout
 *
 * Revokes this device's session and clears the cookies. Always reports success — a client
 * that thinks it is logged out while the server disagrees is the worse failure.
 */
async function logout(req, res, next) {
  const context = describeRequest(req);
  try {
    const rawToken = readRefreshToken(req);
    if (rawToken) {
      await sessionService.revokeByToken(rawToken, 'logout');
    } else if (req.user?.sessionId) {
      await sessionService.revokeSessionById(req.user.sessionId, req.user.id, 'logout');
    }

    clearAuthCookies(res);

    if (req.user) {
      track({ type: 'LOGOUT', userId: req.user.id, email: req.user.email, ...context });
    }

    return ok(res, { message: 'Signed out' });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/logout-all
 *
 * Signs out every device, including this one, and bumps `tokenVersion` so access tokens
 * already in flight stop working immediately.
 */
async function logoutAll(req, res, next) {
  const context = describeRequest(req);
  try {
    const revoked = await sessionService.revokeEverything(req.user.id, 'logout_all');
    clearAuthCookies(res);
    track({ type: 'LOGOUT_ALL', userId: req.user.id, email: req.user.email, ...context });
    return ok(res, { message: `Signed out of ${revoked} device(s)`, revokedSessions: revoked });
  } catch (err) {
    return next(err);
  }
}

/** GET /auth/me — the caller's own account, including its resolved permission list. */
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: { include: { userSkills: true } } },
    });
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'Account no longer exists');

    return ok(res, {
      user: toUserDto(user),
      sessionId: req.user.sessionId,
      emailVerificationRequired: EMAIL_VERIFICATION_REQUIRED,
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /auth/sessions — signed-in devices for this account. */
async function listSessions(req, res, next) {
  try {
    const sessions = await sessionService.listSessions(req.user.id, {
      currentSessionId: req.user.sessionId,
    });
    return ok(res, { sessions });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /auth/sessions/:id — sign a specific device out. */
async function revokeSession(req, res, next) {
  const context = describeRequest(req);
  try {
    const revoked = await sessionService.revokeSessionById(req.params.id, req.user.id);
    if (!revoked) {
      return fail(res, 404, 'NOT_FOUND', 'That session does not exist or is already signed out');
    }

    // Revoking the session you are using is just a logout.
    const isCurrent = req.params.id === req.user.sessionId;
    if (isCurrent) clearAuthCookies(res);

    track({
      type: 'LOGOUT',
      userId: req.user.id,
      email: req.user.email,
      detail: isCurrent ? 'revoked_current_session' : 'revoked_other_session',
      ...context,
    });

    return ok(res, { message: 'Device signed out', wasCurrentSession: isCurrent });
  } catch (err) {
    return next(err);
  }
}

/** GET /auth/security-events — this account's own security timeline. */
async function getSecurityEvents(req, res, next) {
  try {
    const events = await listUserEvents(req.user.id, { take: req.query.take });
    return ok(res, { events });
  } catch (err) {
    return next(err);
  }
}

// ===========================================================================
// Password reset & change
// ===========================================================================

/**
 * POST /auth/forgot-password
 *
 * Always returns the same response whether or not the address is registered — this is the
 * classic account-enumeration endpoint and it must not distinguish.
 */
async function forgotPassword(req, res, next) {
  const context = describeRequest(req);
  try {
    const { email } = req.body;
    const genericResponse = {
      message: 'If an account exists for that address, a password reset link is on its way.',
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return ok(res, genericResponse);

    // Only the newest link should work.
    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });

    const { token, tokenHash, expiresAt } = createEmailToken(authConfig.passwordResetTtlSec);
    await prisma.authToken.create({
      data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash, expiresAt },
    });
    await mailer.sendPasswordResetEmail({ to: user.email, name: user.name, token });

    track({ type: 'PASSWORD_RESET_REQUESTED', userId: user.id, email, ...context });

    return ok(res, {
      ...genericResponse,
      ...(IS_DEV
        ? { devResetUrl: `${authConfig.clientUrl}/reset-password?token=${encodeURIComponent(token)}` }
        : {}),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/reset-password
 *
 * Consumes the token, sets the new password, and signs every device out — a reset is the
 * remedy for a compromised account, so leaving other sessions alive would defeat it.
 */
async function resetPassword(req, res, next) {
  const context = describeRequest(req);
  try {
    const { token, password } = req.body;

    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!record || record.type !== 'PASSWORD_RESET') {
      return fail(res, 400, 'TOKEN_INVALID', 'This reset link is not valid. Request a new one.');
    }
    if (record.usedAt) {
      return fail(res, 400, 'TOKEN_USED', 'This reset link has already been used. Request a new one.');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      return fail(res, 400, 'TOKEN_EXPIRED', 'This reset link has expired. Request a new one.');
    }
    if (!record.user.isActive) {
      return fail(res, 403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();

    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
          // Completing an emailed link proves control of the mailbox.
          emailVerified: true,
          emailVerifiedAt: record.user.emailVerifiedAt || now,
          isVerified: true,
        },
      }),
    ]);

    await sessionService.revokeEverything(record.userId, 'password_reset');
    clearAuthCookies(res);

    track({ type: 'PASSWORD_RESET', userId: record.userId, email: record.user.email, ...context });
    void mailer.sendPasswordChangedEmail({ to: record.user.email, name: record.user.name });

    return ok(res, {
      message: 'Password updated. Sign in with your new password.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/change-password
 *
 * For a signed-in user. Requires the current password, except for a Google-only account
 * setting its first password (there is nothing to prove and the session already
 * authenticates them). Other devices are signed out; this one stays in.
 */
async function changePassword(req, res, next) {
  const context = describeRequest(req);
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'Account no longer exists');

    const isSettingFirstPassword = !user.passwordHash;

    if (!isSettingFirstPassword) {
      if (!currentPassword) {
        return fail(res, 422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', {
          fields: { currentPassword: 'Your current password is required' },
        });
      }
      const currentOk = await verifyPassword(currentPassword, user.passwordHash);
      if (!currentOk) {
        track({
          type: 'LOGIN_FAILED',
          userId: user.id,
          email: user.email,
          detail: 'change_password_wrong_current',
          ...context,
        });
        return fail(res, 422, 'INVALID_CREDENTIALS', 'Please correct the highlighted fields', {
          fields: { currentPassword: 'Incorrect password' },
        });
      }
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    // Sign every *other* device out, then re-establish this one so the user is not logged
    // out of the tab they are using. tokenVersion was bumped, so the old access token in
    // that tab is already dead and must be replaced.
    await sessionService.revokeEverything(user.id, 'password_changed');
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    const tokens = await issueSession(req, res, fresh, {
      provider: 'PASSWORD',
      rememberMe: false,
    });

    track({
      type: 'PASSWORD_CHANGED',
      userId: user.id,
      email: user.email,
      detail: isSettingFirstPassword ? 'first_password_set' : 'changed_by_user',
      ...context,
    });
    void mailer.sendPasswordChangedEmail({ to: user.email, name: user.name });

    return ok(res, {
      ...tokens,
      user: toUserDto(fresh),
      message: isSettingFirstPassword
        ? 'Password set. Other devices have been signed out.'
        : 'Password updated. Other devices have been signed out.',
    });
  } catch (err) {
    return next(err);
  }
}

// ===========================================================================
// Profile
// ===========================================================================

/** PATCH /auth/profile — update the caller's own name / mobile / avatar / profile links. */
async function updateProfile(req, res, next) {
  try {
    const { name, mobile, avatarUrl, bio, githubUrl, linkedinUrl } = req.body;

    if (mobile) {
      const clash = await prisma.user.findFirst({
        where: { mobile, id: { not: req.user.id } },
        select: { id: true },
      });
      if (clash) {
        return fail(res, 409, 'ALREADY_EXISTS', 'Please correct the highlighted fields', {
          fields: { mobile: 'An account with this mobile number already exists' },
        });
      }
    }

    const userData = {};
    if (name !== undefined) userData.name = name;
    if (avatarUrl !== undefined) userData.avatarUrl = avatarUrl;
    if (mobile !== undefined) {
      userData.mobile = mobile;
      // Changing the number invalidates any prior verification of it.
      userData.mobileVerified = false;
    }

    const profileData = {};
    if (bio !== undefined) profileData.bio = bio;
    if (githubUrl !== undefined) profileData.githubUrl = githubUrl;
    if (linkedinUrl !== undefined) profileData.linkedinUrl = linkedinUrl;

    try {
      if (Object.keys(userData).length) {
        await prisma.user.update({ where: { id: req.user.id }, data: userData });
      }
      if (Object.keys(profileData).length) {
        await prisma.profile.upsert({
          where: { userId: req.user.id },
          create: { userId: req.user.id, ...profileData },
          update: profileData,
        });
      }
    } catch (err) {
      if (isUniqueViolation(err, 'mobile')) {
        return fail(res, 409, 'ALREADY_EXISTS', 'Please correct the highlighted fields', {
          fields: { mobile: 'An account with this mobile number already exists' },
        });
      }
      throw err;
    }

    const updated = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: { include: { userSkills: true } } },
    });

    return ok(res, { user: toUserDto(updated), message: 'Profile updated' });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/google/unlink
 *
 * Refused when it would leave the account with no way to sign in — a Google-only account
 * must set a password first.
 */
async function unlinkGoogle(req, res, next) {
  const context = describeRequest(req);
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.googleId) {
      return fail(res, 400, 'NOT_LINKED', 'No Google account is linked to this profile');
    }
    if (!user.passwordHash) {
      return fail(
        res,
        409,
        'LAST_LOGIN_METHOD',
        'Set a password before unlinking Google, otherwise you would not be able to sign in.'
      );
    }

    await prisma.user.update({ where: { id: user.id }, data: { googleId: null } });
    track({ type: 'GOOGLE_UNLINKED', userId: user.id, email: user.email, ...context });

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: { include: { userSkills: true } } },
    });
    return ok(res, { user: toUserDto(updated), message: 'Google account unlinked' });
  } catch (err) {
    return next(err);
  }
}

/** GET /auth/config — what the sign-in page needs to know about this server. */
function getAuthConfig(_req, res) {
  return ok(res, {
    googleEnabled: authConfig.google.isConfigured,
    googleClientId: authConfig.google.clientId || null,
    googleCodeFlowEnabled: authConfig.google.supportsCodeFlow,
    emailVerificationRequired: EMAIL_VERIFICATION_REQUIRED,
    passwordPolicy: {
      minLength: authConfig.passwordMinLength,
      maxLength: authConfig.passwordMaxLength,
      requiresUppercase: true,
      requiresLowercase: true,
      requiresNumber: true,
    },
    accessTokenTtlSec: authConfig.accessTokenTtlSec,
    // Dev-only signal so the UI can offer "copy the link from the server console".
    ...(IS_DEV ? { mailProvider: mailer.activeProvider() } : {}),
  });
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  googleLogin,
  googleStart,
  googleCallback,
  refresh,
  logout,
  logoutAll,
  getMe,
  listSessions,
  revokeSession,
  getSecurityEvents,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  unlinkGoogle,
  getAuthConfig,
  // exported for tests
  reconcileRole,
};
