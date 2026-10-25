/** Letras e números sem os que se confundem (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código no formato ABC-123. `random` devolve [0, 1). */
export function generateCode(random: () => number): string {
  const pick = () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]!;
  const part = () => pick() + pick() + pick();
  return `${part()}-${part()}`;
}

const VALID = new RegExp(`^[${CODE_ALPHABET}]{6}$`);

/** Lê o código do que a pessoa colou: o código (com ou sem hífen/espaço) ou o link de convite. */
export function parseInvite(input: string): string | null {
  let text = input.trim().toUpperCase();
  // Link do app (…/#/convite/ABC-123) ou o curto, com prévia (…/c/ABC-123).
  const marker = ['/CONVITE/', '/C/'].find((m) => text.includes(m));
  if (marker) text = text.slice(text.indexOf(marker) + marker.length).split(/[?#/&]/)[0]!;
  const raw = text.replace(/[\s-]/g, '');
  return VALID.test(raw) ? `${raw.slice(0, 3)}-${raw.slice(3)}` : null;
}

/** Link de convite. As rotas usam # porque o GitHub Pages não tem fallback de SPA. */
export function inviteLink(appBase: string, code: string): string {
  const base = appBase.replace(/[^/]*$/, '');
  return `${base}#/convite/${code}`;
}

/**
 * Link curto do convite, servido pelo Firebase Hosting: a prévia (WhatsApp, iMessage…) mostra o
 * nome e o emoji do split e a página abre o convite no app.
 */
export function shortInviteLink(host: string, code: string): string {
  return `${host.replace(/\/+$/, '')}/c/${code}`;
}

/** Link pessoal de recuperação (decisão 6): vale até ser revogado. */
export function recoveryLink(appBase: string, token: string): string {
  const base = appBase.replace(/[^/]*$/, '');
  return `${base}#/r/${token}`;
}
