import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type UiLanguage = 'ar' | 'en';

export const LANGUAGE_KEY = 'duma_ui_language';

interface LanguageContextValue {
  language: UiLanguage;
  setLanguage: (value: UiLanguage) => void;
  t: (arabic: string, english: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const applyDocumentLanguage = (value: UiLanguage) => {
  document.documentElement.lang = value;
  document.documentElement.dir = value === 'ar' ? 'rtl' : 'ltr';
};

const getInitialLanguage = (): UiLanguage => {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === 'ar' || stored === 'en') return stored;
  return 'ar';
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => getInitialLanguage());

  useEffect(() => {
    applyDocumentLanguage(language);
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  const setLanguage = (value: UiLanguage) => {
    setLanguageState(value);
  };

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (arabic, english) => (language === 'ar' ? arabic : english),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

