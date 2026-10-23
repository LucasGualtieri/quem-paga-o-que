import { describe, expect, it } from 'vitest';
import { isValidDate, normalizeTags, TAGS } from '../src/index.ts';

describe('tags', () => {
  it('são as 6 do protótipo, com "other" como padrão', () => {
    expect(TAGS).toEqual(['food', 'drinks', 'transport', 'stay', 'fun', 'other']);
  });

  it('sem tag escolhida a despesa recebe "Outros"', () => {
    expect(normalizeTags([])).toEqual(['other']);
    expect(normalizeTags(undefined)).toEqual(['other']);
  });

  it('descarta inválidas e repetidas, mantendo a ordem', () => {
    expect(normalizeTags(['drinks', 'x', 'food', 'drinks'])).toEqual(['drinks', 'food']);
    expect(normalizeTags(['x'])).toEqual(['other']);
  });
});

describe('isValidDate', () => {
  it('aceita só AAAA-MM-DD de verdade', () => {
    expect(isValidDate('2026-12-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('28/12/2026')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
});
