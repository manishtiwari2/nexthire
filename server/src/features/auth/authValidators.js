const { z } = require('zod');
const { authConfig } = require('./authConfig');
const { ASSIGNABLE_ROLES } = require('../../shared/authz');

/**
 * Server-side request validation. The client validates the same rules with the same
 * messages for a responsive form, but these schemas are the actual gate — every field
 * that reaches Prisma has been through one of them.
 *
 * Sanitisation happens here too (trim, lowercase email, normalise phone), so controllers
 * only ever see canonical values.
 */

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

const nameField = z
  .string({ required_error: 'Full name is required' })
  .trim()
  .min(3, 'Full name must be at least 3 characters')
  .max(80, 'Full name must be at most 80 characters')
  // Letters (any script), spaces, apostrophes, hyphens and dots. Blocks control
  // characters and markup that would otherwise be stored and echoed back.
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u, 'Full name may only contain letters, spaces, apostrophes, hyphens and dots');

const emailField = z
  .string({ required_error: 'Email address is required' })
  .trim()
  .min(1, 'Email address is required')
  .max(254, 'Email address is too long')
  .email('Enter a valid email address')
  // Stored lowercase so uniqueness is case-insensitive.
  .transform((value) => value.toLowerCase());

/**
 * Normalise a phone number towards E.164: keep a leading `+` and the digits, drop the
 * spaces/dashes/parens people type. Requires 8–15 digits, which covers every national
 * numbering plan without accepting obvious junk.
 */
const mobileField = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .min(1, 'Mobile number is required')
  .transform((value) => {
    const hasPlus = value.trim().startsWith('+');
    const digits = value.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  })
  .refine((value) => /^\+?\d{8,15}$/.test(value), 'Enter a valid mobile number (8–15 digits, optional +country code)');

const passwordField = z
  .string({ required_error: 'Password is required' })
  .min(authConfig.passwordMinLength, `Password must be at least ${authConfig.passwordMinLength} characters`)
  .max(authConfig.passwordMaxLength, `Password must be at most ${authConfig.passwordMaxLength} characters`)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

/** Login accepts any non-empty string — the policy is only enforced when *setting* one. */
const loginPasswordField = z
  .string({ required_error: 'Password is required' })
  .min(1, 'Password is required')
  .max(authConfig.passwordMaxLength, 'Password is too long');

const tokenField = z
  .string({ required_error: 'Token is required' })
  .trim()
  .min(16, 'This link is not valid')
  .max(256, 'This link is not valid');

const rememberMeField = z.coerce.boolean().optional().default(false);

/** Only http(s) URLs — a `javascript:` or `data:` avatar would be an XSS vector. */
const avatarField = z
  .string()
  .trim()
  .max(1024, 'Avatar URL is too long')
  .refine((value) => /^https?:\/\//i.test(value), 'Avatar must be an http(s) URL');

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const registerSchema = z
  .object({
    name: nameField,
    email: emailField,
    mobile: mobileField,
    password: passwordField,
    confirmPassword: z.string({ required_error: 'Please confirm your password' }),
    rememberMe: rememberMeField,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  // Catches "Password1" style passwords that satisfy every character class but are just
  // the account's own identity.
  .refine((data) => !data.password.toLowerCase().includes(data.email.split('@')[0].toLowerCase()), {
    path: ['password'],
    message: 'Password must not contain your email name',
  });

const loginSchema = z.object({
  email: emailField,
  password: loginPasswordField,
  rememberMe: rememberMeField,
});

const googleCredentialSchema = z.object({
  /** The GIS ID token. Everything else about the user comes from inside it. */
  credential: z.string({ required_error: 'Google credential is required' }).min(32, 'Invalid Google credential'),
  rememberMe: rememberMeField,
});

const forgotPasswordSchema = z.object({ email: emailField });

const resetPasswordSchema = z
  .object({
    token: tokenField,
    password: passwordField,
    confirmPassword: z.string({ required_error: 'Please confirm your password' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

const verifyEmailSchema = z.object({ token: tokenField });

const resendVerificationSchema = z.object({ email: emailField });

const changePasswordSchema = z
  .object({
    /** Optional so a Google-only account can *set* its first password. */
    currentPassword: z.string().max(authConfig.passwordMaxLength).optional(),
    newPassword: passwordField,
    confirmPassword: z.string({ required_error: 'Please confirm your password' }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((data) => !data.currentPassword || data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from your current password',
  });

const updateProfileSchema = z
  .object({
    name: nameField.optional(),
    mobile: mobileField.optional(),
    avatarUrl: avatarField.optional(),
    bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional(),
    githubUrl: avatarField.optional(),
    linkedinUrl: avatarField.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

// ---- Admin ----------------------------------------------------------------

const adminListUsersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['ADMIN', 'USER', 'INTERVIEWER', 'CANDIDATE']).optional(),
  status: z.enum(['active', 'disabled', 'unverified']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const adminUpdateRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES, { errorMap: () => ({ message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` }) }),
});

const adminSetActiveSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
  reason: z.string().trim().max(240).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flatten a ZodError into `{ field: message }` — the shape react-hook-form can apply
 * directly to inputs via `setError`.
 */
function fieldErrors(zodError) {
  const out = {};
  for (const issue of zodError.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Express middleware factory: validate `req[source]`, replace it with the parsed and
 * sanitised result, or reply 422 with per-field messages.
 */
function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      return res.status(422).json({
        success: false,
        error: 'Please correct the highlighted fields',
        code: 'VALIDATION_ERROR',
        fields: fieldErrors(result.error),
      });
    }
    // `query` is a getter on newer Express versions; assign defensively.
    if (source === 'query') req.validatedQuery = result.data;
    else req[source] = result.data;
    return next();
  };
}

module.exports = {
  validate,
  fieldErrors,
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
  adminUpdateRoleSchema,
  adminSetActiveSchema,
};
