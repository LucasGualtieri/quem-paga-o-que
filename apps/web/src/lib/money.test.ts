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

  it('outras moedas: símbolo pelo idioma; em inglês, $ € £ colam no número', () => {
    expect(formatCents(120000, 'pt-BR', { currency: 'USD' })).toBe('US$ 1.200,00');
    expect(formatCents(120000, 'en', { currency: 'USD' })).toBe('$1,200.00');
    expect(formatCents(1500, 'pt-BR', { currency: 'EUR' })).toBe('€ 15,00');
    expect(formatCents(-1500, 'en', { currency: 'EUR' })).toBe('−€15.00');
    expect(formatCents(1500, 'en', { currency: 'CHF' })).toBe('CHF 15.00');
    expect(formatCents(1500, 'en', { currency: 'BRL' })).toBe('R$ 15.00');
  });

  it('com sinal: + para positivo, − para negativo, nada para zero', () => {
    expect(formatCents(12000, 'pt-BR', { signed: true })).toBe('+R$ 120,00');
    expect(formatCents(-9213, 'pt-BR', { signed: true })).toBe('−R$ 92,13');
    expect(formatCents(0, 'pt-BR', { signed: true })).toBe('R$ 0,00');
  });
});

import { formatInputCents, parseCents, typeAmount } from './money.ts';

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
    expect(parseCents('US$ 12,50')).toBe(1250);
    expect(parseCents('€15.00')).toBe(1500);
    expect(parseCents('-5')).toBeNull();
    expect(parseCents('1,2345')).toBeNull();
    expect(parseCents('1234567890123')).toBeNull();
  });
});

describe('formatInputCents', () => {
  it('sempre com duas casas, no separador do idioma e sem milhar', () => {
    expect(formatInputCents(120050, 'pt-BR')).toBe('1.200,50');
    expect(formatInputCents(120050, 'en')).toBe('1,200.50');
    expect(formatInputCents(5, 'pt-BR')).toBe('0,05');
    expect(formatInputCents(120000, 'pt-BR')).toBe('1.200,00');
  });
});

describe('typeAmount (caixa eletrônico)', () => {
  it('cada dígito entra pelos centavos e empurra os outros', () => {
    const typed = ['1', '12', '123', '1234', '12345', '123456'].map((d) => typeAmount(d, 'pt-BR'));
    expect(typed).toEqual(['0,01', '0,12', '1,23', '12,34', '123,45', '1.234,56']);
    // O campo já formatado ganha um dígito no fim, ou perde o último ao apagar.
    expect(typeAmount('1.234,567', 'pt-BR')).toBe('12.345,67');
    expect(typeAmount('12,3', 'pt-BR')).toBe('1,23');
    expect(typeAmount('90,00', 'en')).toBe('90.00');
  });
  it('só zeros ou nada deixa o campo vazio; para em 11 dígitos', () => {
    expect(typeAmount('0,0', 'pt-BR')).toBe('');
    expect(typeAmount('', 'pt-BR')).toBe('');
    expect(typeAmount('R$ abc', 'pt-BR')).toBe('');
    expect(typeAmount('123456789012', 'pt-BR')).toBe('123.456.789,01');
    expect(parseCents(typeAmount('123456789012', 'pt-BR'))).toBe(12345678901);
  });
});
