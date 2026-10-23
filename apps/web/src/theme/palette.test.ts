import { describe, expect, it } from 'vitest';
import { contrastRatio, parseTokens, tokensToCss } from './palette.ts';

const css = `/* cabeçalho */
.theme-light {
  --bg: #F3F3F0; /* Fundo */
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* Sombra */
}

.theme-dark {
  --bg: #111114; /* Fundo */
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4); /* Sombra */
}
`;

describe('parseTokens', () => {
  it('lê nome, valor e comentário de cada tema', () => {
    const { light, dark } = parseTokens(css);
    expect(light).toEqual([
      { name: '--bg', value: '#F3F3F0', note: 'Fundo' },
      { name: '--shadow', value: '0 1px 2px rgba(0, 0, 0, 0.05)', note: 'Sombra' },
    ]);
    expect(dark[0]).toEqual({ name: '--bg', value: '#111114', note: 'Fundo' });
  });
});

describe('tokensToCss', () => {
  it('aplica as mudanças e preserva o resto do arquivo', () => {
    const out = tokensToCss(css, { light: { '--bg': '#000000' }, dark: {} });
    expect(out).toContain('--bg: #000000; /* Fundo */');
    expect(out).toContain('--bg: #111114; /* Fundo */');
    expect(out).toContain('/* cabeçalho */');
    expect(parseTokens(out).light[1]).toEqual(parseTokens(css).light[1]);
  });

  it('sem mudanças devolve o mesmo arquivo', () => {
    expect(tokensToCss(css, { light: {}, dark: {} })).toBe(css);
  });
});

describe('contrastRatio (WCAG)', () => {
  it('preto sobre branco é 21:1 e cor sobre ela mesma é 1:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#5534E0', '#5534E0')).toBeCloseTo(1, 5);
  });

  it('confere valores de referência da WCAG', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 5);
    // A Folha de estilo arredonda: accent sobre surface ≈ 6,9:1
    expect(contrastRatio('#5534E0', '#FFFFFF')).toBeCloseTo(6.9, 0);
  });

  it('valor que não é hex devolve null', () => {
    expect(contrastRatio('rgba(0,0,0,.4)', '#FFFFFF')).toBeNull();
  });
});
