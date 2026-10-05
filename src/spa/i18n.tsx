// English/Spanish UI language support.
//
// Some SCCS teachers are more comfortable in Spanish, so the whole UI is
// bilingual: a provider holds the current language, and `t()` maps the
// existing English string to its Spanish translation. English literals stay
// the source of truth in the components — `t('Students')` — so the app
// remains fully English even if a translation is missing (fallback = the
// English text itself).
//
// Choice is persisted in localStorage and defaults to the browser language.
// Dynamic values use {placeholders}: t('Page {page} of {total}', { page, total }).
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { dictionary } from './i18n-dictionary';

export type Lang = 'en' | 'es';

const STORAGE_KEY = 'sccs_language';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate an English UI string; returns it unchanged in English mode or
   *  when no translation exists. Interpolates `{var}` placeholders. */
  t: (text: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => undefined,
  t: text => text,
});

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
    return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private browsing — choice just won't persist */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'es' ? 'es' : 'en';
  }, [lang]);

  const t = (text: string, vars?: Record<string, string | number>): string => {
    let out = lang === 'es' ? (dictionary[text] ?? text) : text;
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        out = out.split(`{${key}}`).join(String(value));
      }
    }
    return out;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
