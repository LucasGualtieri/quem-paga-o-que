import { createContext, useContext } from 'react';
import { DEFAULT_CURRENCY, type Currency } from '@qpq/shared';
import { useLang } from '../i18n/index.ts';
import { formatCents } from './money.ts';

/**
 * Moeda do split aberto na tela. As telas de split envolvem o conteúdo com o provedor; fora delas
 * (e nos splits antigos) vale BRL.
 */
const CurrencyContext = createContext<Currency>(DEFAULT_CURRENCY);
export const CurrencyProvider = CurrencyContext.Provider;

export function useCurrency(): Currency {
  return useContext(CurrencyContext);
}

/** `formatCents` no idioma da tela e na moeda do split. */
export function useFmt(): (cents: number, opts?: { signed?: boolean }) => string {
  const lang = useLang();
  const currency = useCurrency();
  return (cents, opts = {}) => formatCents(cents, lang, { ...opts, currency });
}
