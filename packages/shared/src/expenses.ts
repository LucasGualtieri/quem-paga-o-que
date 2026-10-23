/** Tags de despesa (spec 05); sem tag escolhida, "other". */
export const TAGS = ['food', 'drinks', 'transport', 'stay', 'fun', 'other'] as const;
export type Tag = (typeof TAGS)[number];

export function normalizeTags(tags: readonly string[] | undefined): Tag[] {
  const out: Tag[] = [];
  for (const t of tags ?? []) if ((TAGS as readonly string[]).includes(t) && !out.includes(t as Tag)) out.push(t as Tag);
  return out.length ? out : ['other'];
}

/** AAAA-MM-DD que existe no calendário. */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
