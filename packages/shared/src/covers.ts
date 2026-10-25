import type { EntryIcon } from './icons.ts';

/** Emojis de capa do protótipo (splits antigos); a posição define a cor de fundo (--cv-1 … --cv-8). */
export const COVER_EMOJIS = ['🎆', '🎁', '⛰️', '🍕', '🏖️', '🎉', '🍻', '🏕️'] as const;

export type CoverEmoji = (typeof COVER_EMOJIS)[number];
export type CoverColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function isCoverEmoji(emoji: string): emoji is CoverEmoji {
  return (COVER_EMOJIS as readonly string[]).includes(emoji);
}

export function coverColor(emoji: string): CoverColor {
  const i = (COVER_EMOJIS as readonly string[]).indexOf(emoji);
  return (i < 0 ? 1 : i + 1) as CoverColor;
}

/** Capa sem escolha: o ícone de pessoas (24/10/2026). */
export const SPLIT_DEFAULT_ICON: EntryIcon = { kind: 'icon', name: 'people' };

/** A capa do split: o ícone ou emoji escolhido, o emoji dos splits antigos ou o ícone de pessoas. */
export function splitCover(split: { icon?: EntryIcon | null; emoji?: string | null }): EntryIcon {
  if (split.icon) return split.icon;
  return split.emoji ? { kind: 'emoji', value: split.emoji } : SPLIT_DEFAULT_ICON;
}

/** Cor de fundo da capa: a do protótipo para os 8 emojis antigos; para o resto, sempre a mesma por escolha. */
export function coverColorOf(icon: EntryIcon): CoverColor {
  const key = icon.kind === 'emoji' ? icon.value : icon.name;
  if (isCoverEmoji(key)) return coverColor(key);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) % 8;
  return (h + 1) as CoverColor;
}
