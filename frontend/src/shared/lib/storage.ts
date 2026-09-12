'use client';

/**
 * Small, defensive wrapper around localStorage.
 *
 * Every read is validated rather than trusted: the stored shape is from an
 * older build as often as not, and a half-restored session is worse than a
 * fresh one. Every call is guarded because a private window, blocked site data
 * or a full quota all throw rather than return nothing.
 */
export const readStored = <T>(key: string, isValid: (value: unknown) => value is T): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeStored = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a viewer with site data blocked simply loses the preference */
  }
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
