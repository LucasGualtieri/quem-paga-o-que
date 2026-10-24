import type { Lang } from '../i18n/index.ts';

const MINUS = '−';

/**
 * Centavos → texto em reais. A moeda é sempre R$; só os separadores mudam:
 * "R$ 1.200,00" em PT-BR, "R$ 1,200.00" em EN. Conta só com inteiros.
 */
export function formatCents(cents: number, lang: Lang, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100);
  const rest = abs % 100;
  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: 'always' }).format(units);
  const body = `R$ ${grouped}${lang === 'en' ? '.' : ','}${String(rest).padStart(2, '0')}`;
  const sign = cents < 0 ? MINUS : opts.signed && cents > 0 ? '+' : '';
  return sign + body;
}

/**
 * Texto do campo de valor → centavos inteiros. Aceita "12", "12,5", "1.200,50" e
 * "1,200.50": o último separador seguido de 1 ou 2 dígitos é o decimal; os outros são milhar.
 */
export function parseCents(input: string): number | null {
  let s = input.replace(/R\$|\s/g, '');
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
  return formatCents(cents, lang).replace('R$ ', '');
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
