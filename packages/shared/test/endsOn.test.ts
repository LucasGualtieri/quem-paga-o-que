import { describe, expect, it } from 'vitest';
import { endsOnAllowed, endsOnMillis, finalizeClockStart } from '../src/api.ts';

const DAY = 24 * 3600_000;

describe('"Termina em" (spec 04)', () => {
  it('o dia termina à meia-noite seguinte em Brasília', () => {
    expect(new Date(endsOnMillis('2027-01-12')).toISOString()).toBe('2027-01-13T03:00:00.000Z');
  });

  it('aceita datas passadas e até 1 ano à frente; recusa depois disso e datas inválidas', () => {
    const now = Date.parse('2026-10-29T15:00:00Z');
    expect(endsOnAllowed('2026-01-01', now)).toBe(true);
    expect(endsOnAllowed('2027-10-29', now)).toBe(true);
    expect(endsOnAllowed('2027-11-05', now)).toBe(false);
    expect(endsOnAllowed('2027-02-30', now)).toBe(false);
    expect(endsOnAllowed('amanhã', now)).toBe(false);
  });

  it('a contagem começa no que vier depois: última mudança no dinheiro ou fim da data', () => {
    const money = Date.parse('2026-10-20T12:00:00Z');
    expect(finalizeClockStart(money, null)).toBe(money);
    expect(finalizeClockStart(money, '2026-10-01')).toBe(money);
    expect(finalizeClockStart(money, '2027-01-12')).toBe(endsOnMillis('2027-01-12'));
    expect(finalizeClockStart(money, '2027-01-12') - money).toBeGreaterThan(80 * DAY);
  });
});
