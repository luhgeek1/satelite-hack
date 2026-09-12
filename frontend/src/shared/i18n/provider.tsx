'use client';

import * as React from 'react';
import { readStored, writeStored } from '@/shared/lib/storage';
import { dictionaries, type TranslationKey } from './dictionary';
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, isLanguage, type Language } from './language';

/** Kept alongside the cookie so a choice made before it survives. */
const STORAGE_KEY = 'orbitguard-language-v1';
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export type Translate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
  /** Durations carry a unit word, so they are localised with everything else. */
  formatDuration: (seconds: number) => string;
}

const I18nContext = React.createContext<I18nValue | null>(null);

const fill = (template: string, vars?: Record<string, string | number>) =>
  vars
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      )
    : template;

interface LanguageProviderProps {
  /** Read from the cookie by the server, so the first paint is already right. */
  language?: Language;
  children: React.ReactNode;
}

export function LanguageProvider({ language: initial, children }: LanguageProviderProps) {
  const [language, setLanguage] = React.useState<Language>(initial ?? DEFAULT_LANGUAGE);

  const remember = React.useCallback((next: Language) => {
    writeStored(STORAGE_KEY, next);
    document.cookie = `${LANGUAGE_COOKIE}=${next};path=/;max-age=${YEAR_SECONDS};samesite=lax`;
  }, []);

  // Carries a choice made before the cookie existed. It runs once, and only
  // when the server had nothing to go on, so the usual load paints no flicker.
  React.useEffect(() => {
    if (initial) return;
    const saved = readStored(STORAGE_KEY, isLanguage);
    if (!saved || saved === DEFAULT_LANGUAGE) return;
    setLanguage(saved);
    remember(saved);
  }, [initial, remember]);

  React.useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = React.useMemo<I18nValue>(() => {
    const table = dictionaries[language];
    const t: Translate = (key, vars) => fill(table[key] ?? dictionaries.en[key] ?? key, vars);

    return {
      language,
      setLanguage: (next) => {
        setLanguage(next);
        remember(next);
      },
      t,
      formatDuration: (seconds) => {
        if (seconds <= 0) return `0 ${t('unit.min')}`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 90) return `${minutes} ${t('unit.min')}`;
        const hours = minutes / 60;
        return `${hours.toFixed(hours < 10 ? 1 : 0)} ${t('unit.hour')}`;
      },
    };
  }, [language, remember]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}
