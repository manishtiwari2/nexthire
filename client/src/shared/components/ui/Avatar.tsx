import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  /**
   * Real photo URL (e.g. from Google/GitHub). Empty, null, or a legacy placeholder
   * (`api.dicebear.com`) is treated as "no photo" and rendered as deterministic initials.
   */
  src?: string | null;
  /** Display name — drives the initials and the accessible label. */
  name?: string | null;
  /** Email — used for initials/color seed when no name is present, and to seed the color. */
  email?: string | null;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 rounded-md text-[10px]',
  sm: 'h-8 w-8 rounded-lg text-xs',
  md: 'h-10 w-10 rounded-lg text-sm',
  lg: 'h-12 w-12 rounded-xl text-base',
  xl: 'h-20 w-20 rounded-2xl text-2xl',
};

/**
 * Deterministic palette built from the theme's container/on-container pairs, which are tuned
 * for legible text on a filled chip in dark mode. Error/danger is deliberately excluded so an
 * avatar never reads as an alert.
 */
const palette = [
  'bg-primary-container text-on-primary-container',
  'bg-secondary-container text-on-secondary-container',
  'bg-tertiary-container text-on-tertiary-container',
  'bg-success-container text-on-success-container',
  'bg-warning-container text-on-warning-container',
  'bg-info-container text-on-info-container',
];

/** A usable photo is a non-empty URL that is not one of our old fabricated-placeholder providers. */
function isRealPhoto(src?: string | null): src is string {
  if (!src) return false;
  const s = src.trim();
  if (!s) return false;
  // Legacy accounts persisted a dicebear URL as their avatar; render those as initials instead.
  if (s.includes('api.dicebear.com')) return false;
  return true;
}

function initialsFrom(name?: string | null, email?: string | null): string {
  const n = (name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  const e = (email || '').trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return '?';
}

/** Stable djb2 hash → palette index, so the same identity gets the same color on every page. */
function colorFor(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

/**
 * Consistent user avatar. Shows the real photo when one exists; otherwise renders deterministic
 * initials on a color derived from the user's identity — no external network calls, so it can
 * never disappear, reload, or momentarily show a different image between pages.
 */
export const Avatar: React.FC<AvatarProps> = ({ src, name, email, size = 'md', className }) => {
  const [failed, setFailed] = useState(false);

  // Reset the error flag if the source changes, so a later real photo isn't hidden by a
  // previous one's load failure.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = (name || email || 'User').trim();
  const base = cn(
    'inline-flex shrink-0 select-none items-center justify-center overflow-hidden border border-outline-variant',
    sizeClasses[size],
    className,
  );

  if (isRealPhoto(src) && !failed) {
    return (
      <img
        src={src}
        alt={label}
        onError={() => setFailed(true)}
        className={cn(base, 'bg-surface-container object-cover')}
      />
    );
  }

  const seed = (email || name || 'user').toLowerCase();
  return (
    <span role="img" aria-label={label} className={cn(base, 'font-semibold', colorFor(seed))}>
      {initialsFrom(name, email)}
    </span>
  );
};
