import { describe, expect, it } from 'vitest';
import { AUTO_COVER_ICONS, autoCover, COVER_EMOJIS, coverColor, coverColorOf, ICON_CHOICES, isCoverEmoji, pickCover, SPLIT_DEFAULT_ICON, splitCover } from '../src/index.ts';

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
    // Sem escolha e com id: a automática, sempre a mesma para o split.
    expect(splitCover({ id: 'abc', icon: null, emoji: '' })).toEqual(autoCover('abc'));
  });

  it('cor: a do protótipo nos emojis antigos; nos outros, sempre a mesma (1–8)', () => {
    expect(coverColorOf({ kind: 'emoji', value: '🍕' })).toBe(4);
    const c = coverColorOf({ kind: 'emoji', value: '🦄' });
    expect(coverColorOf({ kind: 'emoji', value: '🦄' })).toBe(c);
    for (const name of ['people', 'beach', 'car', 'pizza'] as const) expect(coverColorOf({ kind: 'icon', name })).toBeGreaterThanOrEqual(1);
    expect(coverColorOf({ kind: 'icon', name: 'people' })).toBeLessThanOrEqual(8);
  });
});

describe('capa automática', () => {
  it('24 ícones do seletor, sem genéricos nem o de pessoas', () => {
    expect(AUTO_COVER_ICONS).toHaveLength(24);
    for (const n of AUTO_COVER_ICONS) expect(ICON_CHOICES).toContain(n);
    for (const n of ['receipt', 'box', 'cart', 'people', 'pill'] as const) expect(AUTO_COVER_ICONS).not.toContain(n);
  });

  it('fixa por split; splits diferentes tendem a ícones diferentes', () => {
    expect(autoCover('s1')).toEqual(autoCover('s1'));
    const names = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (autoCover(id) as { name: string }).name));
    expect(names.size).toBeGreaterThan(3);
  });

  it('sorteio evita os ícones já usados; sem livre, usa qualquer um', () => {
    const taken = AUTO_COVER_ICONS.slice(0, 23).map((name) => ({ kind: 'icon' as const, name }));
    expect(pickCover([...taken, { kind: 'emoji', value: '🎆' }], () => 0.5)).toEqual({ kind: 'icon', name: AUTO_COVER_ICONS[23] });
    const all = AUTO_COVER_ICONS.map((name) => ({ kind: 'icon' as const, name }));
    expect(pickCover(all, () => 0)).toEqual({ kind: 'icon', name: AUTO_COVER_ICONS[0] });
    expect(AUTO_COVER_ICONS).toContain((pickCover([]) as { name: string }).name);
  });
});
