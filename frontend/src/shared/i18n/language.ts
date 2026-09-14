



export type Language = 'ru' | 'en';


export const DEFAULT_LANGUAGE: Language = 'ru';






export const LANGUAGE_COOKIE = 'orbitguard-language';

export const isLanguage = (value: unknown): value is Language =>
  value === 'ru' || value === 'en';

export const resolveLanguage = (value: unknown): Language =>
  isLanguage(value) ? value : DEFAULT_LANGUAGE;
