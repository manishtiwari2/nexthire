import { z } from 'zod';

/**
 * Client-side validation, mirroring `server/src/features/auth/authValidators.js`.
 *
 * These exist for the *experience* — inline messages as the user types, a submit button
 * that does not fire a doomed request. They are not a security control: the server runs
 * the identical rules and is the only thing that decides what is accepted. When the two
 * disagree, the server's per-field errors are applied to the form via `setError`.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const name = z
  .string()
  .trim()
  .min(3, 'Full name must be at least 3 characters')
  .max(80, 'Full name must be at most 80 characters')
  .regex(
    /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u,
    'Full name may only contain letters, spaces, apostrophes, hyphens and dots'
  );

const email = z
  .string()
  .trim()
  .min(1, 'Email address is required')
  .max(254, 'Email address is too long')
  .email('Enter a valid email address');

const mobile = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .refine(
    (value) => /^\+?\d{8,15}$/.test(value.replace(/[\s()-]/g, '')),
    'Enter a valid mobile number (8–15 digits, optional +country code)'
  );

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z
  .object({
    name,
    email,
    mobile,
    password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    // No `rememberMe` here on purpose: registration does not sign the user in (the account
    // is inert until the emailed link is used), so the form has no such control. Requiring a
    // field the form never renders would fail validation on something the user cannot see.
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine(
    (data) => {
      const handle = data.email.split('@')[0]?.toLowerCase();
      return !handle || !data.password.toLowerCase().includes(handle);
    },
    { path: ['password'], message: 'Password must not contain your email name' }
  );

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((data) => !data.currentPassword || data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from your current password',
  });

export const profileSchema = z.object({
  name,
  mobile: mobile.optional().or(z.literal('')),
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), 'Avatar must be an http(s) URL')
    .optional()
    .or(z.literal('')),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional().or(z.literal('')),
  githubUrl: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), 'Must be an http(s) URL')
    .optional()
    .or(z.literal('')),
  linkedinUrl: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), 'Must be an http(s) URL')
    .optional()
    .or(z.literal('')),
});

/**
 * Form types are written out rather than derived with `z.infer`.
 *
 * This project compiles with `strict: false`, so `strictNullChecks` is off — and zod's
 * inference decides optionality with `undefined extends T`, which is *always true* without
 * strictNullChecks. Every inferred property would therefore come out optional, and
 * `handleSubmit` would hand callers `{ email?: string }` for fields the schema requires.
 * Declaring the shapes keeps the form callbacks honestly typed.
 */
export interface RegisterInput {
  name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ProfileInput {
  name: string;
  mobile?: string;
  avatarUrl?: string;
  bio?: string;
  githubUrl?: string;
  linkedinUrl?: string;
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

export interface PasswordStrength {
  /** 0–4. 0–1 weak, 2 fair, 3 good, 4 strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** Requirement checklist rendered under the field. */
  checks: { label: string; met: boolean }[];
}

const COMMON_PATTERNS = [
  /^password/i,
  /^12345/,
  /^qwerty/i,
  /^letmein/i,
  /^welcome/i,
  /^admin/i,
  /(.)\1{3,}/, // four or more of the same character
];

/**
 * A deliberately simple heuristic — length, character classes, and a handful of obvious
 * patterns. It guides the user; it does not gate submission (the policy checks do that).
 */
export function scorePassword(value: string): PasswordStrength {
  const checks = [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: value.length >= PASSWORD_MIN_LENGTH },
    { label: 'An uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'A lowercase letter', met: /[a-z]/.test(value) },
    { label: 'A number', met: /[0-9]/.test(value) },
  ];

  if (!value) return { score: 0, label: 'Too short', checks };
  if (value.length < PASSWORD_MIN_LENGTH) return { score: 0, label: 'Too short', checks };

  let points = checks.filter((c) => c.met).length; // 1–4
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;
  if (/[^A-Za-z0-9]/.test(value)) points += 1;
  if (COMMON_PATTERNS.some((pattern) => pattern.test(value))) points -= 2;

  const score = Math.max(1, Math.min(4, points - 2)) as 1 | 2 | 3 | 4;
  const labels = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' } as const;
  return { score, label: labels[score], checks };
}
