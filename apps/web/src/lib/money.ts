import { DEFAULT_CURRENCY, type Currency } from '@qpq/shared';
import type { Lang } from '../i18n/index.ts';

const MINUS = '−';

const localeOf = (lang: Lang) => (lang === 'en' ? 'en-US' : 'pt-BR');

/** Símbolo da moeda no idioma da tela: "R$", "US$" (PT) ou "$" (EN), "€", "CHF"… */
export function currencySymbol(currency: Currency, lang: Lang): string {
  const parts = new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

/** Só o número, com milhar e duas casas ("1.200,00" ou "1,200.00"). */
function amountText(abs: number, lang: Lang): string {
  const grouped = new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 0, useGrouping: 'always' }).format(Math.floor(abs / 100));
  return `${grouped}${lang === 'en' ? '.' : ','}${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Centavos → texto na moeda do split (sem moeda, R$). O idioma decide os separadores e a moeda o
 * símbolo: "R$ 1.200,00" e "R$ 1,200.00"; "US$ 1.200,00" e "$1,200.00"; "€ 15,00" e "€15.00".
 * Em inglês, símbolo de sinais ($, €, £) cola no número; R$ e siglas (CHF) levam espaço.
 * Conta só com inteiros.
 */
export function formatCents(cents: number, lang: Lang, opts: { signed?: boolean; currency?: Currency } = {}): string {
  const currency = opts.currency ?? DEFAULT_CURRENCY;
  const symbol = currencySymbol(currency, lang);
  const glue = lang === 'en' && currency !== 'BRL' && !/[A-Za-z]$/.test(symbol) ? '' : ' ';
  const sign = cents < 0 ? MINUS : opts.signed && cents > 0 ? '+' : '';
  return `${sign}${symbol}${glue}${amountText(Math.abs(cents), lang)}`;
}

/**
 * Texto do campo de valor → centavos inteiros. Aceita "12", "12,5", "1.200,50" e
 * "1,200.50": o último separador seguido de 1 ou 2 dígitos é o decimal; os outros são milhar.
 */
export function parseCents(input: string): number | null {
  // Sem o símbolo da moeda ("R$", "US$", "€"…) nem espaços.
  let s = input.replace(/^[^\d.,\-−]+|\s/g, '');
  if (s === '') return null;
  if (/^[.,]/.test(s)) s = `0${s}`;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let whole = s;
  let cents = '00';
  if (last >= 0) {
    const after = s.length - last - 1;
    if (after === 0) whole = s.slice(0, last);
    else if (after <= 2) {
      whole = s.slice(0, last);
      cents = s.slice(last + 1).padEnd(2, '0');
    } else if (after !== 3) return null;
  }
  const digits = whole.replace(/[.,]/g, '');
  if (digits.length > 9) return null;
  return Number(digits) * 100 + Number(cents);
}

/** Centavos → texto para editar no campo (com milhar, duas casas, sem "R$"). */
export function formatInputCents(cents: number, lang: Lang): string {
  return amountText(Math.abs(cents), lang);
}

/**
 * Campo de valor como no caixa eletrônico: o primeiro dígito é centavo e cada dígito novo empurra
 * os outros uma casa para a esquerda ("1", "12", "123" → 0,01 · 0,12 · 1,23). Apagar faz o
 * caminho inverso. Devolve o texto do campo (vazio sem nenhum dígito além de zeros).
 */
export function typeAmount(raw: string, lang: Lang): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
  return digits === '' ? '' : formatInputCents(Number(digits), lang);
}
