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
const github = require('./githubService');
const {
  issueOAuthState,
  clearOAuthState,
  consumeOAuthState,
  safeRedirectPath,
} = require('./oauthState');
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
 * (USER) is left alone so an admin-assigned role survives login.
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

/**
 * Ensure a Profile row exists — several features assume one. Safe to call repeatedly.
 *
 * `fillIfEmpty` sets fields only when they are currently null, so a value the user typed
 * themselves is never overwritten by one an OAuth provider happens to know.
 */
async function ensureProfile(userId, fillIfEmpty = {}) {
  const profile = await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...fillIfEmpty },
    update: {},
  });

  const missing = Object.fromEntries(
    Object.entries(fillIfEmpty).filter(([key, value]) => value && !profile[key])
  );
  if (Object.keys(missing).length) {
    await prisma.profile.update({ where: { userId }, data: missing });
  }
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
// OAuth (Google, GitHub)
// ===========================================================================

/**
 * Everything that differs between the OAuth providers, in one table.
 *
 * The find-or-create-or-link logic below is the security-critical part of social sign-in,
 * so it exists exactly once and is driven by this registry. Adding a provider must not mean
 * re-deriving the linking rules — a second copy is a second chance to get them wrong.
 */
const OAUTH_PROVIDERS = {
  GOOGLE: {
    provider: 'GOOGLE',
    label: 'Google',
    /** Column on User holding the provider's stable account id. */
    idColumn: 'googleId',
    linkedEvent: 'GOOGLE_LINKED',
    unlinkedEvent: 'GOOGLE_UNLINKED',
  },
  GITHUB: {
    provider: 'GITHUB',
    label: 'GitHub',
    idColumn: 'githubId',
    linkedEvent: 'GITHUB_LINKED',
    unlinkedEvent: 'GITHUB_UNLINKED',
    /**
     * GitHub tells us the user's profile URL, which is exactly what Profile.githubUrl is
     * for. Filled in only when the user has not set one.
     */
    profileFields: (profile) => (profile.profileUrl ? { githubUrl: profile.profileUrl } : {}),
  },
};

/**
 * Find-or-create the local account behind a *verified* OAuth profile.
 *
 * Linking rule: if an account already exists with the same email address, the provider
 * identity is attached to it rather than creating a second account. That is safe only
 * because every caller has already established that the provider verified the address —
 * `verifyIdToken` rejects a Google token whose `email_verified` is not true, and
 * `fetchProfile` only ever returns a GitHub address marked `verified: true`. Without that
 * guarantee this function is an account-takeover primitive: anyone could attach their own
 * provider account to someone else's address and inherit their NextHire account.
 *
 * @param {'GOOGLE'|'GITHUB'} providerKey
 * @param {{ email: string, name: string|null, picture: string|null }} profile
 *        Plus the provider's id under the registry's `idColumn`.
 */
async function upsertOAuthUser(providerKey, profile, context) {
  const spec = OAUTH_PROVIDERS[providerKey];
  const { idColumn } = spec;
  const providerUserId = profile[idColumn];
  const profileFields = spec.profileFields ? spec.profileFields(profile) : {};

  if (!providerUserId) {
    throw new Error(`${spec.label} profile is missing its account id`);
  }

  const byProviderId = await prisma.user.findUnique({ where: { [idColumn]: providerUserId } });
  const existing = byProviderId || (await prisma.user.findUnique({ where: { email: profile.email } }));

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        [idColumn]: providerUserId,
        avatarUrl: profile.picture || defaultAvatar(profile.email),
        role: roleForEmail(profile.email),
        // The provider has verified the address; there is nothing left for us to verify.
        emailVerified: true,
        emailVerifiedAt: new Date(),
        isVerified: true,
      },
    });
    await ensureProfile(created.id, profileFields);
    track({
      type: 'REGISTER',
      userId: created.id,
      email: created.email,
      provider: spec.provider,
      detail: `created_via_${spec.provider.toLowerCase()}`,
      ...context,
    });
    return { user: created, linked: false, created: true };
  }

  if (!existing.isActive) {
    const error = new Error('account_disabled');
    error.disabledUser = existing;
    throw error;
  }

  const linking = !existing[idColumn];
  const now = new Date();

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      // An already-linked account keeps the id it was linked with. Signing in from a second
      // provider account that shares the verified address is allowed — the mailbox proves
      // it is the same person — but it must not silently re-point the link.
      [idColumn]: existing[idColumn] || providerUserId,
      // Signing in with a verified provider identity settles email verification for an
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

  await ensureProfile(updated.id, profileFields);

  if (linking) {
    track({
      type: spec.linkedEvent,
      userId: updated.id,
      email: updated.email,
      provider: spec.provider,
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
      result = await upsertOAuthUser('GOOGLE', profile, context);
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

/**
 * The authorization-code flow, shared by every provider.
 *
 * `CODE_FLOWS` holds only what actually differs — how the consent URL is built, how a code
 * becomes a verified profile, and which error type the service throws. Google additionally
 * carries a `nonce` because it returns a signed ID token that could otherwise be replayed;
 * GitHub has no ID token, so it has no nonce.
 */
const CODE_FLOWS = {
  GOOGLE: {
    key: 'GOOGLE',
    label: 'Google',
    cookieProvider: 'google',
    isEnabled: () => authConfig.google.supportsCodeFlow,
    notConfigured: {
      code: 'GOOGLE_NOT_CONFIGURED',
      message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    },
    createState: () => google.createOAuthState(),
    buildAuthUrl: ({ state, nonce }) => google.buildAuthUrl({ state, nonce }),
    /** @returns the verified profile, or throws the service's own error type. */
    exchange: async (code, { nonce }) => {
      const { profile } = await google.exchangeCode(code, { expectedNonce: nonce });
      return profile;
    },
    isServiceError: (err) => err instanceof google.GoogleAuthError,
  },
  GITHUB: {
    key: 'GITHUB',
    label: 'GitHub',
    cookieProvider: 'github',
    isEnabled: () => authConfig.github.isConfigured,
    notConfigured: {
      code: 'GITHUB_NOT_CONFIGURED',
      message: 'GitHub sign-in is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
    },
    createState: () => github.createOAuthState(),
    buildAuthUrl: ({ state }) => github.buildAuthUrl({ state }),
    exchange: async (code) => {
      const { profile } = await github.exchangeCodeForProfile(code);
      return profile;
    },
    isServiceError: (err) => err instanceof github.GithubAuthError,
  },
};

/**
 * Entry point for a code flow: stash `state` (+ `nonce` where the provider has one) in a
 * short-lived HTTP-only cookie, then redirect to the provider's consent screen. The cookie
 * is what makes the callback verifiable — see oauthState.js.
 */
function startCodeFlow(flowKey, req, res) {
  const flow = CODE_FLOWS[flowKey];

  if (!flow.isEnabled()) {
    return fail(res, 503, flow.notConfigured.code, flow.notConfigured.message);
  }

  const { state, nonce } = flow.createState();
  const redirect = safeRedirectPath(req.query.redirect);
  const rememberMe = req.query.remember === 'true' || req.query.remember === '1';

  issueOAuthState(res, { provider: flow.cookieProvider, state, nonce, redirect, rememberMe });

  return res.redirect(flow.buildAuthUrl({ state, nonce }));
}

/**
 * Callback for a code flow. This is a browser *navigation*, not an XHR, so every outcome —
 * success or failure — has to end in a redirect the SPA can act on: `/auth/callback#…` with
 * the access token in the fragment, or `/login?error=…`.
 *
 * The fragment is deliberate: fragments are never sent to a server, so the short-lived
 * access token stays out of access logs, proxy logs and `Referer` headers.
 */
async function completeCodeFlow(flowKey, req, res, next) {
  const flow = CODE_FLOWS[flowKey];
  const context = describeRequest(req);

  const redirectWithError = (code, message) => {
    clearOAuthState(res);
    const params = new URLSearchParams({ error: code, error_description: message });
    return res.redirect(`${authConfig.clientUrl}/login?${params.toString()}`);
  };

  try {
    if (req.query.error) {
      // The user hit "Cancel" on the provider's consent screen.
      track({ type: 'LOGIN_FAILED', provider: flow.key, detail: 'user_denied', ...context });
      return redirectWithError(`${flow.key}_DENIED`, `${flow.label} sign-in was cancelled.`);
    }

    const handshake = consumeOAuthState(req, flow.cookieProvider);
    if (!handshake.ok) {
      track({ type: 'LOGIN_FAILED', provider: flow.key, detail: handshake.code.toLowerCase(), ...context });
      return redirectWithError(handshake.code, handshake.message);
    }
    const stored = handshake.value;

    if (typeof req.query.code !== 'string' || !req.query.code) {
      return redirectWithError(`${flow.key}_NO_CODE`, `${flow.label} did not return an authorization code.`);
    }

    let profile;
    try {
      profile = await flow.exchange(req.query.code, { nonce: stored.nonce });
    } catch (err) {
      if (flow.isServiceError(err)) {
        track({ type: 'LOGIN_FAILED', provider: flow.key, detail: err.code, ...context });
        return redirectWithError(err.code, err.message);
      }
      throw err;
    }

    let result;
    try {
      result = await upsertOAuthUser(flow.key, profile, context);
    } catch (err) {
      if (err.message === 'account_disabled') {
        track({
          type: 'LOGIN_FAILED',
          userId: err.disabledUser.id,
          email: err.disabledUser.email,
          provider: flow.key,
          detail: 'account_disabled',
          ...context,
        });
        return redirectWithError('ACCOUNT_DISABLED', 'This account has been disabled.');
      }
      throw err;
    }

    const tokens = await issueSession(req, res, result.user, {
      provider: flow.key,
      rememberMe: Boolean(stored.rememberMe),
    });

    track({
      type: 'LOGIN_SUCCESS',
      userId: result.user.id,
      email: result.user.email,
      provider: flow.key,
      detail: 'code_flow',
      ...context,
    });

    clearOAuthState(res);

    const fragment = new URLSearchParams({
      access_token: tokens.accessToken,
      expires_in: String(tokens.expiresIn),
      redirect: stored.redirect || '/dashboard',
      provider: flow.key,
      ...(result.created ? { new_account: '1' } : {}),
    });
    return res.redirect(`${authConfig.clientUrl}/auth/callback#${fragment.toString()}`);
  } catch (err) {
    return next(err);
  }
}

/** GET /auth/google/start */
function googleStart(req, res) {
  return startCodeFlow('GOOGLE', req, res);
}

/** GET /auth/google/callback */
function googleCallback(req, res, next) {
  return completeCodeFlow('GOOGLE', req, res, next);
}

/** GET /auth/github/start */
function githubStart(req, res) {
  return startCodeFlow('GITHUB', req, res);
}

/** GET /auth/github/callback */
function githubCallback(req, res, next) {
  return completeCodeFlow('GITHUB', req, res, next);
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
 * Every way this account could still sign in if `excludeProviderKey` were unlinked.
 *
 * With more than one provider, "can they still get in?" stopped being the same question as
 * "do they have a password?" — a GitHub-only user who links Google may unlink GitHub, and
 * vice versa. Getting this wrong either locks people out or blocks a legitimate unlink.
 */
function remainingLoginMethods(user, excludeProviderKey) {
  const methods = [];
  if (user.passwordHash) methods.push('password');
  for (const [key, spec] of Object.entries(OAUTH_PROVIDERS)) {
    if (key === excludeProviderKey) continue;
    if (user[spec.idColumn]) methods.push(spec.label);
  }
  return methods;
}

/**
 * Unlink an OAuth provider from the signed-in account. Refused when it would leave the
 * account with no way to sign in at all.
 */
async function unlinkOAuthProvider(providerKey, req, res, next) {
  const spec = OAUTH_PROVIDERS[providerKey];
  const context = describeRequest(req);

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'Account no longer exists');

    if (!user[spec.idColumn]) {
      return fail(res, 400, 'NOT_LINKED', `No ${spec.label} account is linked to this profile`);
    }

    if (!remainingLoginMethods(user, providerKey).length) {
      return fail(
        res,
        409,
        'LAST_LOGIN_METHOD',
        `${spec.label} is currently your only way to sign in. Set a password or link another provider first.`
      );
    }

    await prisma.user.update({ where: { id: user.id }, data: { [spec.idColumn]: null } });
    track({
      type: spec.unlinkedEvent,
      userId: user.id,
      email: user.email,
      provider: spec.provider,
      ...context,
    });

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: { include: { userSkills: true } } },
    });
    return ok(res, { user: toUserDto(updated), message: `${spec.label} account unlinked` });
  } catch (err) {
    return next(err);
  }
}

/** POST /auth/google/unlink */
function unlinkGoogle(req, res, next) {
  return unlinkOAuthProvider('GOOGLE', req, res, next);
}

/** POST /auth/github/unlink */
function unlinkGithub(req, res, next) {
  return unlinkOAuthProvider('GITHUB', req, res, next);
}

/** GET /auth/config — what the sign-in page needs to know about this server. */
function getAuthConfig(_req, res) {
  return ok(res, {
    googleEnabled: authConfig.google.isConfigured,
    googleClientId: authConfig.google.clientId || null,
    googleCodeFlowEnabled: authConfig.google.supportsCodeFlow,
    /**
     * GitHub has no browser-side flow to advertise a client id for — it is OAuth 2.0 only,
     * so the single boolean covers it: enabled means the server can run the code flow.
     */
    githubEnabled: authConfig.github.isConfigured,
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
  githubStart,
  githubCallback,
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
  unlinkGithub,
  getAuthConfig,
  // exported for tests
  reconcileRole,
  remainingLoginMethods,
};
