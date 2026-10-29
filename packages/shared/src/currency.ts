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

/** Fusos horários de cada moeda (os principais de cada país). */
const BY_ZONE: Array<[RegExp, Currency]> = [
  [/^America\/(Sao_Paulo|Rio_Branco|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Belem|Fortaleza|Recife|Maceio|Bahia|Araguaina|Santarem|Eirunepe|Noronha)$/, 'BRL'],
  [/^America\/(Argentina\/.+|Buenos_Aires)$/, 'ARS'],
  [/^America\/Montevideo$/, 'UYU'],
  [/^America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana)$/, 'MXN'],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Whitehorse|Yellowknife|Iqaluit|Glace_Bay|Goose_Bay|Swift_Current|Dawson_Creek|Fort_Nelson|Rankin_Inlet|Cambridge_Bay|Inuvik)$/, 'CAD'],
  [/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Adak|Nome|Sitka|Metlakatla|Yakutat|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu)$/, 'USD'],
  [/^Australia\/.+$/, 'AUD'],
  [/^Europe\/(London|Belfast)$/, 'GBP'],
  [/^Europe\/(Zurich|Vaduz)$/, 'CHF'],
  [/^Europe\/(Paris|Berlin|Madrid|Rome|Lisbon|Amsterdam|Brussels|Vienna|Dublin|Helsinki|Athens|Luxembourg|Bratislava|Ljubljana|Tallinn|Riga|Vilnius|Malta|Zagreb|Monaco|San_Marino|Vatican|Andorra)$|^Atlantic\/(Madeira|Azores|Canary)$|^Asia\/Nicosia$/, 'EUR'],
];

/** Moeda do país do fuso horário do aparelho (onde a pessoa está), ou `null` se não reconhecer. */
export function currencyFromTimeZone(zone: string | undefined): Currency | null {
  if (!zone) return null;
  return BY_ZONE.find(([re]) => re.test(zone))?.[1] ?? null;
}

/**
 * Moeda que vem marcada ao criar um split (revisto em 29/10/2026): primeiro o fuso horário do
 * aparelho (um navegador em inglês no Brasil continua em BRL), depois o país do idioma do
 * navegador; sem nenhum dos dois, BRL.
 */
export function defaultCurrency(zone: string | undefined, locales: readonly string[]): Currency {
  return currencyFromTimeZone(zone) ?? currencyFromLocales(locales);
}
