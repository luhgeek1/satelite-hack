'use client';

import * as React from 'react';
import { readStored, writeStored } from '@/shared/lib/storage';
import { dictionaries, type TranslationKey } from './dictionary';

export type Language = 'ru' | 'en';

/** Russian is the working language of the case; English is the alternative. */
export const DEFAULT_LANGUAGE: Language = 'ru';
const STORAGE_KEY = 'orbitguard-language-v1';

const isLanguage = (value: unknown): value is Language => value === 'ru' || value === 'en';

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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = React.useState<Language>(DEFAULT_LANGUAGE);

  // Read after mount: the page is prerendered in the default language, and
  // picking the stored one during the first render would make the server's
  // markup and the client's disagree.
  React.useEffect(() => {
    const saved = readStored(STORAGE_KEY, isLanguage);
    if (saved) setLanguage(saved);
  }, []);

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
        writeStored(STORAGE_KEY, next);
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
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}
