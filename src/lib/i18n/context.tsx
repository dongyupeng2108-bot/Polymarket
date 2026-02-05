'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ZH } from './zh';
import { EN } from './en';

export type Locale = 'zh' | 'en';

type Translations = typeof ZH;

const dictionaries: Record<Locale, Translations> = {
  zh: ZH,
  en: EN as unknown as Translations, // Cast to ensure compatibility if keys slightly mismatch
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('arb_locale') as Locale;
    if (stored && (stored === 'zh' || stored === 'en')) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('arb_locale', newLocale);
  };

  const t = (key: string): string => {
    const dict = dictionaries[locale];
    const val = (dict as any)[key];
    if (val) return val;
    
    // Fallback
    const fallbackLocale = locale === 'zh' ? 'en' : 'zh';
    const fallbackVal = (dictionaries[fallbackLocale] as any)[key];
    if (fallbackVal) return fallbackVal;

    // console.warn(`Missing translation for key: ${key}`);
    return key;
  };

  if (!mounted) {
    // Render nothing or loading until we know the locale from storage to prevent hydration mismatch
    // Or just render with default 'zh' then update.
    // For simple apps, rendering default is fine, but can cause flicker.
    // Let's render children.
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
