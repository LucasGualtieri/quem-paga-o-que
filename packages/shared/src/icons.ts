/**
 * Ícone ou emoji de uma despesa ou de um item (como no Notion: ícone da coleção do app OU emoji).
 * Sem escolha (`null`), a despesa usa o ícone da tag e o item, um ícone padrão próprio.
 */
export type EntryIcon = { kind: 'icon'; name: IconChoice } | { kind: 'emoji'; value: string };

/** Ícones que o seletor oferece (os nomes são os de apps/web/src/components/Icon.tsx). */
export const ICON_CHOICES = [
  'food',
  'pizza',
  'coffee',
  'cart',
  'drink',
  'beer',
  'wine',
  'cake',
  'car',
  'fuel',
  'parking',
  'bus',
  'train',
  'plane',
  'bike',
  'home',
  'bed',
  'tent',
  'beach',
  'map',
  'ticket',
  'film',
  'music',
  'game',
  'ball',
  'party',
  'gift',
  'shirt',
  'scissors',
  'pill',
  'heart',
  'paw',
  'book',
  'phone',
  'wifi',
  'bolt',
  'drop',
  'flame',
  'wrench',
  'star',
  'receipt',
  'box',
  'people',
] as const;
export type IconChoice = (typeof ICON_CHOICES)[number];

/** Ícone automático da despesa pela primeira tag; sem tag (ou "Outros"), o recibo. */
export const TAG_ICON: Record<string, IconChoice> = { food: 'food', drinks: 'drink', transport: 'car', stay: 'home' };
export const EXPENSE_DEFAULT_ICON: IconChoice = 'receipt';
/** Item sem escolha: um ícone próprio, diferente do da despesa. */
export const ITEM_DEFAULT_ICON: IconChoice = 'box';

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** Confere o que veio do app; `undefined`/`null` = automático. Inválido devolve `false`. */
export function parseEntryIcon(v: unknown): EntryIcon | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.kind === 'icon') return (ICON_CHOICES as readonly unknown[]).includes(o.name) ? { kind: 'icon', name: o.name as IconChoice } : false;
  if (o.kind === 'emoji' && typeof o.value === 'string' && o.value.length <= 16 && !/\s/.test(o.value) && EMOJI.test(o.value)) return { kind: 'emoji', value: o.value };
  return false;
}

/** O que mostrar: o escolhido, ou o automático da despesa (pela tag) ou do item. */
export function resolveIcon(icon: EntryIcon | null | undefined, fallback: { tags: readonly string[] } | 'item'): EntryIcon {
  if (icon) return icon;
  if (fallback === 'item') return { kind: 'icon', name: ITEM_DEFAULT_ICON };
  return { kind: 'icon', name: TAG_ICON[fallback.tags[0] ?? 'other'] ?? EXPENSE_DEFAULT_ICON };
}
