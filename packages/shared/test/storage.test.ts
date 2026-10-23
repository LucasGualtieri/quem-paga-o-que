import { describe, expect, it } from 'vitest';
import { avatarPath, coverPath, proofPath, receiptPath } from '../src/index.ts';

describe('caminhos no Storage (decisão 9)', () => {
  it('comprovante guarda as duas pontas do pagamento no caminho (as regras leem dali)', () => {
    expect(proofPath('s1', 'm2', 'm1', 'a.jpg')).toBe('splits/s1/proofs/m2/m1/a.jpg');
  });

  it('comprovante da despesa, capa e foto de perfil', () => {
    expect(receiptPath('s1', 'e1', 'n.jpg')).toBe('splits/s1/receipts/e1/n.jpg');
    expect(coverPath('s1', 'c.jpg')).toBe('covers/s1/c.jpg');
    expect(avatarPath('u1', 'f.jpg')).toBe('users/u1/f.jpg');
  });
});
