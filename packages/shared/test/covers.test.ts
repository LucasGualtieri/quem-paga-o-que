import { describe, expect, it } from 'vitest';
import { COVER_EMOJIS, coverColor, coverColorOf, isCoverEmoji, SPLIT_DEFAULT_ICON, splitCover } from '../src/index.ts';

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

describe('capa com ícone ou emoji', () => {
  it('escolhido, emoji antigo ou o ícone de pessoas', () => {
    expect(splitCover({ icon: { kind: 'icon', name: 'beach' }, emoji: '🎆' })).toEqual({ kind: 'icon', name: 'beach' });
    expect(splitCover({ emoji: '🎆' })).toEqual({ kind: 'emoji', value: '🎆' });
    expect(splitCover({ icon: null, emoji: '' })).toEqual(SPLIT_DEFAULT_ICON);
  });

  it('cor: a do protótipo nos emojis antigos; nos outros, sempre a mesma (1–8)', () => {
    expect(coverColorOf({ kind: 'emoji', value: '🍕' })).toBe(4);
    const c = coverColorOf({ kind: 'emoji', value: '🦄' });
    expect(coverColorOf({ kind: 'emoji', value: '🦄' })).toBe(c);
    for (const name of ['people', 'beach', 'car', 'pizza'] as const) expect(coverColorOf({ kind: 'icon', name })).toBeGreaterThanOrEqual(1);
    expect(coverColorOf({ kind: 'icon', name: 'people' })).toBeLessThanOrEqual(8);
  });
});
