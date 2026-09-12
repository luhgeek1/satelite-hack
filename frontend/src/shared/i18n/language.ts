/**
 * The language identity, kept free of React and of 'use client' so both the
 * server layout and the browser can read it.
 */
export type Language = 'ru' | 'en';

/** Russian is the working language of the case; English is the alternative. */
export const DEFAULT_LANGUAGE: Language = 'ru';

/**
 * A cookie rather than localStorage alone: the server renders the first frame,
 * and only a cookie reaches it. Read from storage the page would paint in the
 * default language and swap after hydration, which is visible as a flicker.
 */
export const LANGUAGE_COOKIE = 'orbitguard-language';

export const isLanguage = (value: unknown): value is Language =>
  value === 'ru' || value === 'en';

export const resolveLanguage = (value: unknown): Language =>
  isLanguage(value) ? value : DEFAULT_LANGUAGE;
