const bcrypt = require('bcryptjs');
const { authConfig } = require('./authConfig');

/**
 * Password hashing and strength scoring.
 *
 * Hashes use bcrypt with 12 rounds (authConfig.bcryptRounds). Plaintext is never stored,
 * logged, or returned; the hash never leaves this module's callers via any DTO.
 */

/** bcrypt silently truncates at 72 *bytes* — reject longer input instead of accepting a prefix. */
const BCRYPT_MAX_BYTES = 72;

async function hashPassword(plain) {
  if (typeof plain !== 'string' || !plain) {
    throw new Error('Password must be a non-empty string');
  }
  if (Buffer.byteLength(plain, 'utf8') > BCRYPT_MAX_BYTES) {
    throw new Error('Password is too long');
  }
  return bcrypt.hash(plain, authConfig.bcryptRounds);
}

/**
 * Constant-time-ish comparison via bcrypt. Returns false (never throws) for accounts
 * with no password set, so Google-only accounts fall through to the generic
 * "invalid credentials" path without revealing that no password exists.
 */
async function verifyPassword(plain, hash) {
  if (!hash || typeof plain !== 'string' || !plain) return false;
  if (Buffer.byteLength(plain, 'utf8') > BCRYPT_MAX_BYTES) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same CPU as a real verification when the account does not exist.
 * Without this, "user not found" returns measurably faster than "wrong password" and
 * the endpoint becomes an account-existence oracle.
 */
async function fakeVerifyDelay() {
  await bcrypt.hash('nexthire::timing::equalizer', authConfig.bcryptRounds);
}

/**
 * The policy enforced on both ends. The client renders these messages live; the server
 * re-runs the identical check because client validation is a convenience, not a control.
 */
function passwordPolicyErrors(plain) {
  const errors = [];
  const value = typeof plain === 'string' ? plain : '';

  if (value.length < authConfig.passwordMinLength) {
    errors.push(`Must be at least ${authConfig.passwordMinLength} characters`);
  }
  if (value.length > authConfig.passwordMaxLength) {
    errors.push(`Must be at most ${authConfig.passwordMaxLength} characters`);
  }
  if (!/[A-Z]/.test(value)) errors.push('Must contain an uppercase letter');
  if (!/[a-z]/.test(value)) errors.push('Must contain a lowercase letter');
  if (!/[0-9]/.test(value)) errors.push('Must contain a number');

  return errors;
}

function isPasswordAcceptable(plain) {
  return passwordPolicyErrors(plain).length === 0;
}

module.exports = {
  hashPassword,
  verifyPassword,
  fakeVerifyDelay,
  passwordPolicyErrors,
  isPasswordAcceptable,
};
