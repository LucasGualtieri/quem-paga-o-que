import type { Lang } from '../i18n/index.ts';

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** "Qui, 31 dez" em PT, "Thu, Dec 31" em EN. */
export function shortDay(d: Date, lang: Lang): string {
  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  const parts = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d);
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '');
  const [weekday, day, month] = [cap(get('weekday')), get('day'), get('month')];
  return lang === 'en' ? `${weekday}, ${month} ${day}` : `${weekday}, ${day} ${month}`;
}

/** "31 dez" em PT, "Dec 31" em EN (linhas de Minha visão). */
export function dayMonth(d: Date, lang: Lang): string {
  return shortDay(d, lang).replace(/^[^,]*, /, '');
}

/** "Ter, 22 dez · 18:20" em PT, "Tue, Dec 22 · 6:20 PM" em EN. */
export function shortDayTime(d: Date, lang: Lang): string {
  const time = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'pt-BR', { hour: 'numeric', minute: '2-digit', hour12: lang === 'en' }).format(d);
  return `${shortDay(d, lang)} · ${time}`;
}

/** AAAA-MM-DD → Date ao meio-dia (não vira o dia anterior por fuso). */
export function dateOf(ymd: string): Date {
  return new Date(`${ymd}T12:00:00`);
}
