import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ptBR from './pt-BR.json';

export type Lang = 'pt-BR' | 'en';

const KEY = 'qpq.lang';

/**
 * Primeira visita (sem escolha salva): o idioma preferido do navegador. Qualquer português
 * (pt-BR, pt-PT…) abre em PT-BR; o resto, em EN. A escolha da pessoa sempre vence.
 */
export function detectLang(languages: readonly string[]): Lang {
  const first = languages[0];
  if (!first) return 'pt-BR';
  return /^pt\b/i.test(first) ? 'pt-BR' : 'en';
}

function storedLang(): Lang {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Sem armazenamento: detecta de novo a cada visita.
  }
  if (saved === 'en' || saved === 'pt-BR') return saved;
  return typeof navigator === 'undefined' ? 'pt-BR' : detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  lng: storedLang(),
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  initAsync: false,
});

const syncDocument = (lng: string) => {
  document.documentElement.lang = lng;
};
syncDocument(i18n.language);
i18n.on('languageChanged', syncDocument);

/** Troca o idioma e guarda a escolha (preferência do aparelho até existir conta). */
export async function setLang(lang: Lang): Promise<void> {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Sem armazenamento (navegação privada): vale só nesta sessão.
  }
  await i18n.changeLanguage(lang);
}

function subscribe(cb: () => void) {
  i18n.on('languageChanged', cb);
  return () => i18n.off('languageChanged', cb);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => (i18n.language === 'en' ? 'en' : 'pt-BR'));
}

export default i18n;
