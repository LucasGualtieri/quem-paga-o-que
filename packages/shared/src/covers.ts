import type { EntryIcon, IconChoice } from './icons.ts';

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

/** "Remover" a capa: o ícone de pessoas, salvo como escolha (deixa claro que foi tirada). */
export const SPLIT_DEFAULT_ICON: EntryIcon = { kind: 'icon', name: 'people' };

/**
 * Ícones da capa automática (25/10/2026): só os que combinam com motivos de dividir conta em
 * grupo (comer e beber, festa e lazer, viagem e passeio). Genéricos de despesa, utilitários e o
 * de pessoas ficam de fora, mas continuam no seletor.
 */
export const AUTO_COVER_ICONS: readonly IconChoice[] = [
  'food',
  'pizza',
  'cake',
  'coffee',
  'beer',
  'drink',
  'wine',
  'flame',
  'party',
  'gift',
  'music',
  'ticket',
  'ball',
  'game',
  'film',
  'star',
  'heart',
  'beach',
  'tent',
  'map',
  'plane',
  'car',
  'home',
  'bike',
];

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

/** Split sem nenhuma escolha (antigos): um ícone do conjunto, sempre o mesmo para o mesmo split. */
export function autoCover(splitId: string): EntryIcon {
  return { kind: 'icon', name: AUTO_COVER_ICONS[hash(splitId) % AUTO_COVER_ICONS.length]! };
}

/** Sorteio na criação: evita os ícones que a pessoa já usa nos outros splits, enquanto houver livre. */
export function pickCover(taken: readonly EntryIcon[], random: () => number = Math.random): EntryIcon {
  const used = new Set(taken.flatMap((c) => (c.kind === 'icon' ? [c.name] : [])));
  const free = AUTO_COVER_ICONS.filter((n) => !used.has(n));
  const pool = free.length ? free : AUTO_COVER_ICONS;
  return { kind: 'icon', name: pool[Math.floor(random() * pool.length)]! };
}

/** A capa do split: o ícone ou emoji escolhido, o emoji dos splits antigos ou a automática. */
export function splitCover(split: { id?: string; icon?: EntryIcon | null; emoji?: string | null }): EntryIcon {
  if (split.icon) return split.icon;
  if (split.emoji) return { kind: 'emoji', value: split.emoji };
  return split.id ? autoCover(split.id) : SPLIT_DEFAULT_ICON;
}

/** Cor de fundo da capa: a do protótipo para os 8 emojis antigos; para o resto, sempre a mesma por escolha. */
export function coverColorOf(icon: EntryIcon): CoverColor {
  const key = icon.kind === 'emoji' ? icon.value : icon.name;
  if (isCoverEmoji(key)) return coverColor(key);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) % 8;
  return (h + 1) as CoverColor;
}
