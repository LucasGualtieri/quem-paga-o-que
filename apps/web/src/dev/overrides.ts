import { useSyncExternalStore } from 'react';
import { overridesToCss, type Overrides } from '../theme/palette.ts';

// Mudanças feitas na tela Paleta. Ficam só neste navegador; o código só muda com "Copiar CSS".
const KEY = 'qpq.paletteOverrides';
const STYLE_ID = 'palette-overrides';
const EMPTY: Overrides = { light: {}, dark: {} };
const listeners = new Set<() => void>();

function load(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Overrides>) : {};
    return { light: parsed.light ?? {}, dark: parsed.dark ?? {} };
  } catch {
    return EMPTY;
  }
}

let current: Overrides = load();

function apply(o: Overrides) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
  }
  // Sempre o último do <head>, para vencer o CSS do app.
  document.head.appendChild(el);
  el.textContent = overridesToCss(o);
}

export function initOverrides(): void {
  apply(current);
}

export function setOverrides(o: Overrides): void {
  current = o;
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // Sem armazenamento: vale até recarregar.
  }
  apply(o);
  for (const l of listeners) l();
}

export function hasOverrides(o: Overrides): boolean {
  return Object.keys(o.light).length + Object.keys(o.dark).length > 0;
}

export function useOverrides(): Overrides {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
