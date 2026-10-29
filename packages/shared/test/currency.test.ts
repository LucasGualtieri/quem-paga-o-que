import { describe, expect, it } from 'vitest';
import { currencyFromLocales, isCurrency } from '../src/currency.ts';

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
