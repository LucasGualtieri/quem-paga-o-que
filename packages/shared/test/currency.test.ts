import { describe, expect, it } from 'vitest';
import { currencyFromLocales, currencyFromTimeZone, defaultCurrency, isCurrency } from '../src/currency.ts';

describe('moeda do split', () => {
  it('vem do país do navegador', () => {
    expect(currencyFromLocales(['pt-BR'])).toBe('BRL');
    expect(currencyFromLocales(['en-US', 'pt-BR'])).toBe('USD');
    expect(currencyFromLocales(['de-DE'])).toBe('EUR');
    expect(currencyFromLocales(['pt-PT'])).toBe('EUR');
    expect(currencyFromLocales(['en-GB'])).toBe('GBP');
    expect(currencyFromLocales(['es-AR'])).toBe('ARS');
    expect(currencyFromLocales(['zh-Hant-TW'])).toBe('BRL');
    expect(currencyFromLocales(['sr-Latn-CH'])).toBe('CHF');
  });

  it('sem país, usa o primeiro que tiver; sem nenhum, BRL', () => {
    expect(currencyFromLocales(['en', 'en-CA'])).toBe('CAD');
    expect(currencyFromLocales(['en'])).toBe('BRL');
    expect(currencyFromLocales([])).toBe('BRL');
  });

  it('só aceita as moedas da lista', () => {
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('JPY')).toBe(false);
    expect(isCurrency(3)).toBe(false);
  });
});

describe('moeda pelo fuso horário', () => {
  it('reconhece o país pelo fuso', () => {
    expect(currencyFromTimeZone('America/Sao_Paulo')).toBe('BRL');
    expect(currencyFromTimeZone('America/Manaus')).toBe('BRL');
    expect(currencyFromTimeZone('America/Argentina/Buenos_Aires')).toBe('ARS');
    expect(currencyFromTimeZone('America/New_York')).toBe('USD');
    expect(currencyFromTimeZone('America/Indiana/Indianapolis')).toBe('USD');
    expect(currencyFromTimeZone('Pacific/Honolulu')).toBe('USD');
    expect(currencyFromTimeZone('America/Toronto')).toBe('CAD');
    expect(currencyFromTimeZone('Europe/Lisbon')).toBe('EUR');
    expect(currencyFromTimeZone('Europe/London')).toBe('GBP');
    expect(currencyFromTimeZone('Europe/Zurich')).toBe('CHF');
    expect(currencyFromTimeZone('Australia/Sydney')).toBe('AUD');
    expect(currencyFromTimeZone('America/Mexico_City')).toBe('MXN');
    expect(currencyFromTimeZone('America/Montevideo')).toBe('UYU');
    expect(currencyFromTimeZone('Asia/Tokyo')).toBeNull();
    expect(currencyFromTimeZone(undefined)).toBeNull();
  });

  it('o fuso vence o idioma: navegador em inglês no Brasil fica em BRL', () => {
    expect(defaultCurrency('America/Sao_Paulo', ['en-US'])).toBe('BRL');
    expect(defaultCurrency('Asia/Tokyo', ['en-US'])).toBe('USD');
    expect(defaultCurrency(undefined, [])).toBe('BRL');
  });
});
