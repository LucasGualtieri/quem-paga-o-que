import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'qpq.theme';
const listeners = new Set<() => void>();

function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let current: Theme = storedTheme();

/** Põe a classe do tema no <html>; os tokens de tokens.css fazem o resto. */
export function applyTheme(theme: Theme = current): void {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(`theme-${theme}`);
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
  applyTheme(theme);
  for (const l of listeners) l();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
