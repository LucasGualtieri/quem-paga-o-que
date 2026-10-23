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

import { formatInputCents, parseCents } from './money.ts';

describe('parseCents (campo de valor)', () => {
  it('reais inteiros e com centavos, vírgula ou ponto', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12,5')).toBe(1250);
    expect(parseCents('12,50')).toBe(1250);
    expect(parseCents('12.50')).toBe(1250);
    expect(parseCents('0,05')).toBe(5);
    expect(parseCents(',50')).toBe(50);
    expect(parseCents('12,')).toBe(1200);
  });

  it('milhar com ponto ou vírgula', () => {
    expect(parseCents('1.200')).toBe(120000);
    expect(parseCents('1.200,50')).toBe(120050);
    expect(parseCents('1,200.50')).toBe(120050);
    expect(parseCents('1.234.567,89')).toBe(123456789);
  });

  it('ignora espaços e "R$"', () => {
    expect(parseCents(' R$ 40,00 ')).toBe(4000);
  });

  it('o que não é valor devolve null', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('-5')).toBeNull();
    expect(parseCents('1,2345')).toBeNull();
    expect(parseCents('1234567890123')).toBeNull();
  });
});

describe('formatInputCents', () => {
  it('sempre com duas casas, no separador do idioma e sem milhar', () => {
    expect(formatInputCents(120050, 'pt-BR')).toBe('1200,50');
    expect(formatInputCents(120050, 'en')).toBe('1200.50');
    expect(formatInputCents(5, 'pt-BR')).toBe('0,05');
    expect(formatInputCents(120000, 'pt-BR')).toBe('1200,00');
  });
});
