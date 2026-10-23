import { describe, expect, it } from 'vitest';
import { dateOf, dayMonth, shortDay, shortDayTime } from './dates.ts';

describe('datas curtas', () => {
  const d = new Date(2026, 11, 31, 18, 20);

  it('PT: dia da semana, dia e mês sem pontos', () => {
    expect(shortDay(d, 'pt-BR')).toBe('Qui, 31 dez');
    expect(shortDayTime(d, 'pt-BR')).toBe('Qui, 31 dez · 18:20');
  });

  it('EN: mês antes do dia e hora com AM/PM', () => {
    expect(shortDay(d, 'en')).toBe('Thu, Dec 31');
    expect(shortDayTime(d, 'en')).toMatch(/^Thu, Dec 31 · 6:20\s?PM$/);
  });

  it('só dia e mês', () => {
    expect(dayMonth(d, 'pt-BR')).toBe('31 dez');
    expect(dayMonth(d, 'en')).toBe('Dec 31');
  });

  it('AAAA-MM-DD não escorrega de dia', () => {
    expect(dateOf('2026-12-31').getDate()).toBe(31);
  });
});
