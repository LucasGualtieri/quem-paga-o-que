import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTokens } from './palette.ts';

// Os testes rodam a partir de apps/web.
const src = join(process.cwd(), 'src');
const tokensPath = join(src, 'theme', 'tokens.css');
const tokensCss = readFileSync(tokensPath, 'utf8');
const specPath = join(process.cwd(), '../../docs/spec/09-design-tema-a11y-idioma-desktop.md');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;

describe('tokens', () => {
  it('nenhuma cor fora de tokens.css', () => {
    const offenders = files(src)
      .filter((f) => /\.(css|tsx?|html)$/.test(f) && f !== tokensPath && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, line, i }))
          .filter(({ line }) => COLOR.test(line))
          .map(({ f, i, line }) => `${relative(src, f)}:${i + 1}: ${line.trim()}`),
      );
    expect(offenders, 'Use um token de theme/tokens.css em vez de cor direta').toEqual([]);
  });

  it('os dois temas definem os mesmos tokens', () => {
    const { light, dark } = parseTokens(tokensCss);
    expect(light.map((t) => t.name)).toEqual(dark.map((t) => t.name));
    expect(light.length).toBeGreaterThan(20);
  });

  it('todo token tem um comentário dizendo onde aparece', () => {
    const { light, dark } = parseTokens(tokensCss);
    for (const t of [...light, ...dark]) expect(t.note, t.name).not.toBe('');
  });

  it('bate com a tabela de tokens da spec (09-design)', () => {
    const { light, dark } = parseTokens(tokensCss);
    const value = (list: typeof light, name: string) => list.find((t) => t.name === name)?.value.toUpperCase();
    const rows = readFileSync(specPath, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('| `--'));
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) {
      const [names, lights, darks] = row.split('|').slice(1, 4).map((c) => c.split('/').map((x) => x.trim()));
      names!.forEach((n, i) => {
        const name = n.replaceAll('`', '');
        expect(value(light, name), `${name} (claro) diferente da spec`).toBe(lights![i]!.toUpperCase());
        expect(value(dark, name), `${name} (escuro) diferente da spec`).toBe(darks![i]!.toUpperCase());
      });
    }
  });
});
