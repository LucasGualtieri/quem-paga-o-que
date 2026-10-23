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
