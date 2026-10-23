import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateCode, inviteLink, parseInvite } from '../src/index.ts';

describe('código de convite', () => {
  it('tem o formato ABC-123, sem caracteres que se confundem', () => {
    let seed = 0;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 200; i++) {
      const code = generateCode(rand);
      expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
      for (const ch of code.replace('-', '')) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('lê o código digitado de vários jeitos', () => {
    expect(parseInvite('K7M-24Q')).toBe('K7M-24Q');
    expect(parseInvite(' k7m 24q ')).toBe('K7M-24Q');
    expect(parseInvite('k7m24q')).toBe('K7M-24Q');
  });

  it('lê o código de dentro do link de convite', () => {
    expect(parseInvite('https://lucasgualtieri.github.io/quem-paga-o-que/#/convite/K7M-24Q')).toBe('K7M-24Q');
    expect(parseInvite('lucasgualtieri.github.io/quem-paga-o-que/#/convite/k7m-24q?x=1')).toBe('K7M-24Q');
  });

  it('texto que não é código devolve null', () => {
    expect(parseInvite('')).toBeNull();
    expect(parseInvite('oi')).toBeNull();
    expect(parseInvite('K7M-24')).toBeNull();
    expect(parseInvite('IIO-000')).toBeNull();
  });

  it('monta o link a partir da base do app', () => {
    expect(inviteLink('https://x.dev/app/', 'K7M-24Q')).toBe('https://x.dev/app/#/convite/K7M-24Q');
    expect(inviteLink('https://x.dev/app/index.html', 'K7M-24Q')).toBe('https://x.dev/app/#/convite/K7M-24Q');
  });
});
