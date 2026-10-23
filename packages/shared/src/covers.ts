/** Emojis de capa do protótipo; a posição define a cor de fundo (--cv-1 … --cv-8). */
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
