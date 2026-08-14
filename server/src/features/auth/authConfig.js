/**
 * Central auth configuration. Everything tunable lives here so the rest of the auth
 * feature never reads `process.env` directly and tests can reason about one surface.
 *
 * Fail-fast rules (production only) are asserted in `assertProductionConfig()`, called
 * from server startup — a missing secret should crash the boot, not silently downgrade
 * security at request time.
 */

const DEV_FALLBACK_SECRET = 'nexthire_dev_secret_key_2026';

const isProduction = process.env.NODE_ENV === 'production';

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function listEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const SECONDS = { minute: 60, hour: 3600, day: 86400 };

/**
 * Emails that are granted ADMIN. The role is derived from this list on every login and
 * on every Google sign-in, so promoting/demoting is a config change, not a data fix.
 * Everyone else gets USER.
 */
const ADMIN_EMAILS = listEnv('ADMIN_EMAILS', [
  'manishtiwari2578@gmail.com',
  'su-24071@sitare.org',
  'anuradhatiwari2401@gmail.com',
  'su-24019@sitare.org',
]);

const authConfig = {
  isProduction,

  // ---- Token secrets -----------------------------------------------------------
  // Access tokens are signed JWTs. Refresh tokens are opaque random strings stored as
  // sha256 hashes (see tokenService), so they need no signing secret of their own.
  accessTokenSecret:
    process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || DEV_FALLBACK_SECRET,
  jwtIssuer: process.env.JWT_ISSUER || 'nexthire',
  jwtAudience: process.env.JWT_AUDIENCE || 'nexthire-app',

  // ---- Lifetimes ---------------------------------------------------------------
  /** Short-lived so a leaked access token has a small blast radius. */
  accessTokenTtlSec: intEnv('ACCESS_TOKEN_TTL_SEC', 15 * SECONDS.minute),
  /** Refresh lifetime for a normal sign-in ("Remember me" off). */
  refreshTokenTtlSec: intEnv('REFRESH_TOKEN_TTL_SEC', 7 * SECONDS.day),
  /** Refresh lifetime when the user ticked "Remember me". */
  refreshTokenRememberTtlSec: intEnv('REFRESH_TOKEN_REMEMBER_TTL_SEC', 30 * SECONDS.day),
  /**
   * Session timeout: a session unused for this long is dead even if its refresh token
   * has not expired. "Remember me" sessions use their full TTL as the idle window.
   */
  sessionIdleTimeoutSec: intEnv('SESSION_IDLE_TIMEOUT_SEC', 12 * SECONDS.hour),
  /** Max concurrent sessions per user; the oldest is evicted beyond this. */
  maxSessionsPerUser: intEnv('MAX_SESSIONS_PER_USER', 10),

  emailVerificationTtlSec: intEnv('EMAIL_VERIFICATION_TTL_SEC', 24 * SECONDS.hour),
  passwordResetTtlSec: intEnv('PASSWORD_RESET_TTL_SEC', 60 * SECONDS.minute),

  // ---- Password policy ---------------------------------------------------------
  bcryptRounds: intEnv('BCRYPT_ROUNDS', 12),
  passwordMinLength: intEnv('PASSWORD_MIN_LENGTH', 8),
  passwordMaxLength: intEnv('PASSWORD_MAX_LENGTH', 128),

  // ---- Brute-force protection --------------------------------------------------
  /** Failed password attempts before the account is temporarily locked. */
  maxFailedLoginAttempts: intEnv('MAX_FAILED_LOGIN_ATTEMPTS', 8),
  loginLockoutSec: intEnv('LOGIN_LOCKOUT_SEC', 15 * SECONDS.minute),

  // ---- Cookies -----------------------------------------------------------------
  cookies: {
    refreshName: process.env.REFRESH_COOKIE_NAME || 'nh_rt',
    /** Readable by JS on purpose: the client echoes it back as a header (double submit). */
    csrfName: process.env.CSRF_COOKIE_NAME || 'nh_csrf',
    /** Set to a parent domain (e.g. ".example.com") when API and app are on subdomains. */
    domain: process.env.COOKIE_DOMAIN || undefined,
    /** `secure` requires HTTPS; forced on in production. */
    secure: isProduction || process.env.COOKIE_SECURE === 'true',
    /**
     * "lax" works when the API and the app share a registrable domain (including
     * localhost:5173 -> localhost:5000). Cross-site deployments need "none" + secure.
     */
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    path: '/',
  },
  csrfHeaderName: 'x-csrf-token',

  // ---- Google OAuth ------------------------------------------------------------
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    /** Must exactly match an "Authorized redirect URI" in the Google Cloud console. */
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 5000}/api/v1/auth/google/callback`,
    get isConfigured() {
      return Boolean(this.clientId);
    },
    /** The authorization-code flow additionally needs the client secret. */
    get supportsCodeFlow() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  // ---- Email -------------------------------------------------------------------
  mail: {
    /** console | smtp | resend | sendgrid */
    provider: (process.env.MAIL_PROVIDER || (isProduction ? 'smtp' : 'console')).toLowerCase(),
    from: process.env.MAIL_FROM || 'NextHire <no-reply@nexthire.local>',
    smtpUrl: process.env.SMTP_URL || '',
    apiKey: process.env.MAIL_API_KEY || '',
  },

  // ---- URLs --------------------------------------------------------------------
  /**
   * Canonical app origin. Used to build the links in verification / reset emails and to
   * redirect back after the Google callback, so it must be the URL a user actually visits.
   */
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, ''),

  /**
   * Origins allowed to make credentialed requests. `credentials: true` forbids a `*`
   * origin, so this has to be an explicit list. Defaults to CLIENT_URL plus the two common
   * Vite dev ports, which keeps a local checkout working whichever port Vite lands on.
   */
  get allowedOrigins() {
    const configured = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim().replace(/\/$/, ''))
      .filter(Boolean);

    if (configured.length) return [...new Set([this.clientUrl, ...configured])];
    if (isProduction) return [this.clientUrl];

    return [...new Set([this.clientUrl, 'http://localhost:3000', 'http://localhost:5173'])];
  },

  // ---- Authorization -----------------------------------------------------------
  adminEmails: ADMIN_EMAILS,
};

/**
 * Resolve the role an email is entitled to. Called on register, on every password
 * login, and on every Google sign-in so the admin list is always authoritative and a
 * client can never nominate its own role.
 */
function roleForEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return authConfig.adminEmails.includes(normalized) ? 'ADMIN' : 'USER';
}

/** Crash the process rather than run production with dev defaults. */
function assertProductionConfig() {
  if (!isProduction) return;

  const problems = [];
  if (
    !process.env.JWT_ACCESS_SECRET &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_FALLBACK_SECRET)
  ) {
    problems.push('JWT_ACCESS_SECRET (or JWT_SECRET) must be set to a strong random value');
  }
  if (authConfig.accessTokenSecret.length < 32) {
    problems.push('JWT access secret must be at least 32 characters');
  }
  // The admin allow-list falls back to the maintainers' own addresses so a local checkout
  // has a working admin. Shipping that fallback to a real deployment would hand ADMIN to
  // whoever controls those inboxes, so production must name its own admins.
  if (!process.env.ADMIN_EMAILS) {
    problems.push('ADMIN_EMAILS must be set explicitly in production (the built-in default is for local development only)');
  }
  if (!authConfig.cookies.secure) {
    problems.push('COOKIE_SECURE must not be disabled in production');
  }
  if (authConfig.mail.provider === 'console') {
    problems.push('MAIL_PROVIDER=console cannot be used in production — configure smtp/resend/sendgrid');
  }
  if (authConfig.mail.provider === 'smtp' && !authConfig.mail.smtpUrl) {
    problems.push('SMTP_URL is required when MAIL_PROVIDER=smtp');
  }
  if (['resend', 'sendgrid'].includes(authConfig.mail.provider) && !authConfig.mail.apiKey) {
    problems.push(`MAIL_API_KEY is required when MAIL_PROVIDER=${authConfig.mail.provider}`);
  }
  // DISABLE_RATE_LIMIT is a test-suite escape hatch. Leaking it into a deployed environment
  // would silently remove every brute-force and abuse control, so refuse to boot with it.
  if (process.env.DISABLE_RATE_LIMIT === '1') {
    problems.push('DISABLE_RATE_LIMIT=1 is a test-only flag and must not be set in production');
  }
  // The judge sandbox is what stands between untrusted user code and the host.
  if (process.env.JUDGE_UNSAFE_LOCAL === '1') {
    problems.push('JUDGE_UNSAFE_LOCAL=1 runs submitted code with no sandbox and must not be set in production');
  }
  if (process.env.AUTH_VERBOSE_LOGIN_ERRORS === 'true') {
    problems.push('AUTH_VERBOSE_LOGIN_ERRORS must be off in production — it is a user-enumeration oracle');
  }

  if (problems.length) {
    throw new Error(`Invalid production auth configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

module.exports = { authConfig, roleForEmail, assertProductionConfig, SECONDS };
