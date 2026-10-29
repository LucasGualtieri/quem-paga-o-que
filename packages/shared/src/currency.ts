/**
 * Moeda do split (decidido em 29/10/2026): uma por split, sem câmbio. Só moedas com 2 casas
 * decimais, para os valores continuarem em centavos inteiros. Sem moeda gravada, BRL.
 */
export const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CAD', 'AUD', 'CHF', 'MXN', 'UYU'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'BRL';

export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
const BY_REGION: Record<string, Currency> = { BR: 'BRL', US: 'USD', GB: 'GBP', AR: 'ARS', CA: 'CAD', AU: 'AUD', CH: 'CHF', LI: 'CHF', MX: 'MXN', UY: 'UYU' };
for (const r of EURO) BY_REGION[r] = 'EUR';

/**
 * Moeda que vem marcada ao criar um split: a do país do navegador ("pt-BR" → BRL, "en-US" → USD,
 * "de-DE" → EUR…). Sem país, ou país fora da lista, BRL.
 */
export function currencyFromLocales(locales: readonly string[]): Currency {
  for (const l of locales) {
    const region = /^[a-z]{2,3}[-_](?:[A-Za-z]{4}[-_])?([A-Za-z]{2})\b/i.exec(l)?.[1]?.toUpperCase();
    if (region) return BY_REGION[region] ?? DEFAULT_CURRENCY;
  }
  return DEFAULT_CURRENCY;
}
