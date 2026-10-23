import { describe, expect, it } from 'vitest';
import { COVER_EMOJIS, coverColor, isCoverEmoji } from '../src/index.ts';

describe('capas', () => {
  it('8 emojis, cada um com sua cor de capa (1–8), como no protótipo', () => {
    expect(COVER_EMOJIS).toHaveLength(8);
    expect(COVER_EMOJIS.map(coverColor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('emoji fora da lista não vale e cai na capa 1', () => {
    expect(isCoverEmoji('🎆')).toBe(true);
    expect(isCoverEmoji('💣')).toBe(false);
    expect(coverColor('💣')).toBe(1);
  });
});
