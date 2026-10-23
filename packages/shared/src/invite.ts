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
  const at = text.indexOf('/CONVITE/');
  if (at >= 0) text = text.slice(at + '/CONVITE/'.length).split(/[?#/&]/)[0]!;
  const raw = text.replace(/[\s-]/g, '');
  return VALID.test(raw) ? `${raw.slice(0, 3)}-${raw.slice(3)}` : null;
}

/** Link de convite. As rotas usam # porque o GitHub Pages não tem fallback de SPA. */
export function inviteLink(appBase: string, code: string): string {
  const base = appBase.replace(/[^/]*$/, '');
  return `${base}#/convite/${code}`;
}
