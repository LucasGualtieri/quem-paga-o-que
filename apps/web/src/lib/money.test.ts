import { describe, expect, it } from 'vitest';
import { formatCents } from './money.ts';

describe('formatCents', () => {
  it('PT-BR: R$ 1.200,00', () => {
    expect(formatCents(120000, 'pt-BR')).toBe('R$ 1.200,00');
    expect(formatCents(1050, 'pt-BR')).toBe('R$ 10,50');
    expect(formatCents(5, 'pt-BR')).toBe('R$ 0,05');
    expect(formatCents(0, 'pt-BR')).toBe('R$ 0,00');
  });

  it('EN: sempre R$, com separadores em inglês', () => {
    expect(formatCents(120000, 'en')).toBe('R$ 1,200.00');
    expect(formatCents(9213, 'en')).toBe('R$ 92.13');
  });

  it('valores grandes não perdem centavo', () => {
    expect(formatCents(123456789012, 'pt-BR')).toBe('R$ 1.234.567.890,12');
  });

  it('negativo sempre leva o sinal de menos (−)', () => {
    expect(formatCents(-9213, 'pt-BR')).toBe('−R$ 92,13');
  });

  it('com sinal: + para positivo, − para negativo, nada para zero', () => {
    expect(formatCents(12000, 'pt-BR', { signed: true })).toBe('+R$ 120,00');
    expect(formatCents(-9213, 'pt-BR', { signed: true })).toBe('−R$ 92,13');
    expect(formatCents(0, 'pt-BR', { signed: true })).toBe('R$ 0,00');
  });
});
