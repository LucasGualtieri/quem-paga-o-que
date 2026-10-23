/** Ferramentas da tela Paleta: ler tokens.css, gerar o CSS editado e medir contraste. */

export interface Token {
  name: string;
  value: string;
  note: string;
}

export type ThemeName = 'light' | 'dark';
export type Overrides = Record<ThemeName, Record<string, string>>;

const BLOCK = /\.theme-(light|dark)\s*\{([^}]*)\}/g;
const DECL = /^\s*(--[\w-]+)\s*:\s*([^;]+?)\s*;\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/;

export function parseTokens(css: string): Record<ThemeName, Token[]> {
  const out: Record<ThemeName, Token[]> = { light: [], dark: [] };
  for (const [, theme, body] of css.matchAll(BLOCK)) {
    for (const line of body!.split('\n')) {
      const m = DECL.exec(line);
      if (m) out[theme as ThemeName].push({ name: m[1]!, value: m[2]!, note: m[3] ?? '' });
    }
  }
  return out;
}

/** O conteúdo de tokens.css com as mudanças aplicadas; comentários e ordem ficam iguais. */
export function tokensToCss(css: string, overrides: Overrides): string {
  return css.replace(BLOCK, (block, theme: ThemeName) => {
    const changes = overrides[theme];
    return block
      .split('\n')
      .map((line) => {
        const m = DECL.exec(line);
        const next = m && changes[m[1]!];
        return next === undefined || !m ? line : line.replace(`${m[1]}: ${m[2]};`, `${m[1]}: ${next};`);
      })
      .join('\n');
  });
}

/** CSS que sobrescreve os tokens em tempo de execução (especificidade maior que tokens.css). */
export function overridesToCss(overrides: Overrides): string {
  return (Object.keys(overrides) as ThemeName[])
    .map((theme) => {
      const decls = Object.entries(overrides[theme]).map(([name, value]) => `${name}:${value};`);
      return decls.length ? `.theme-${theme}.theme-${theme}{${decls.join('')}}` : '';
    })
    .join('\n');
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

/** Hex curto ou longo → hex de 6 dígitos em maiúsculas. */
export function normalizeHex(value: string): string {
  const v = value.trim().replace('#', '');
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
  return `#${full.toUpperCase()}`;
}

function luminance(hex: string): number {
  const v = normalizeHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Contraste WCAG entre duas cores hex; null se alguma não for hex. */
export function contrastRatio(a: string, b: string): number | null {
  if (!isHex(a) || !isHex(b)) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
