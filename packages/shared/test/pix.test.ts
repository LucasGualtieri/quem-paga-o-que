import { describe, expect, it } from 'vitest';
import { crc16, normalizePixKey, pixCopyPaste } from '../src/index.ts';

describe('chave Pix', () => {
  it('CPF com dígitos verificadores válidos (com ou sem pontuação)', () => {
    expect(normalizePixKey('529.982.247-25')).toEqual({ type: 'cpf', key: '52998224725' });
    expect(normalizePixKey('52998224725')).toEqual({ type: 'cpf', key: '52998224725' });
    // Resto 10 vira dígito 0.
    expect(normalizePixKey('100.000.001-08')).toEqual({ type: 'cpf', key: '10000000108' });
  });

  it('11 dígitos que não são CPF viram telefone com +55; 10 dígitos também', () => {
    expect(normalizePixKey('(11) 98765-4321')).toEqual({ type: 'phone', key: '+5511987654321' });
    expect(normalizePixKey('1132654321')).toEqual({ type: 'phone', key: '+551132654321' });
    // Dígitos todos iguais nunca são CPF.
    expect(normalizePixKey('11111111111')).toEqual({ type: 'phone', key: '+5511111111111' });
  });

  it('telefone com +55; outro país ou tamanho errado não vale', () => {
    expect(normalizePixKey('+55 11 98765-4321')).toEqual({ type: 'phone', key: '+5511987654321' });
    expect(normalizePixKey('+1 202 555 0143')).toBeNull();
    expect(normalizePixKey('+55 119')).toBeNull();
  });

  it('CNPJ, e-mail e chave aleatória', () => {
    expect(normalizePixKey('11.222.333/0001-81')).toEqual({ type: 'cnpj', key: '11222333000181' });
    expect(normalizePixKey(' Lucas@Exemplo.com ')).toEqual({ type: 'email', key: 'lucas@exemplo.com' });
    expect(normalizePixKey('123E4567-E12B-12D1-A456-426655440000')).toEqual({ type: 'evp', key: '123e4567-e12b-12d1-a456-426655440000' });
  });

  it('o resto não é chave', () => {
    for (const bad of ['', '   ', 'lucas@', 'abc', '123', '1234567890123456', 'x'.repeat(78)]) expect(normalizePixKey(bad)).toBeNull();
  });
});

describe('Pix copia e cola (BR Code)', () => {
  it('CRC16-CCITT do vetor de teste padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('reproduz o exemplo do manual do BR Code do Banco Central', () => {
    expect(pixCopyPaste({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Fulano de Tal', city: 'BRASILIA', amount: 0 })).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('com valor: campo 54 em reais com ponto; nome sem acento e cortado em 25; cidade padrão', () => {
    const code = pixCopyPaste({ key: '+5511987654321', name: 'Beatriz Conceição de Albuquerque Mello', amount: 1050 });
    expect(code).toContain('540510.50');
    expect(code).toContain('5925Beatriz Conceicao de Albu');
    expect(code).toContain('6006BRASIL');
    expect(code.slice(-8, -4)).toBe('6304');
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
    // Nome só com caracteres fora do ASCII: vira "PIX".
    expect(pixCopyPaste({ key: 'a@b.co', name: '🎉', amount: 100 })).toContain('5903PIX');
  });
});
