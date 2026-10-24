/**
 * Chave Pix da pessoa e o "Pix copia e cola" (BR Code estático do Banco Central), para pagar
 * pelo app sem perguntar a chave no grupo. Uma chave por pessoa na v1.
 */

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export interface PixKey {
  type: PixKeyType;
  /** Como o banco espera: só dígitos (CPF/CNPJ), e-mail em minúsculas, +55… (telefone), UUID (aleatória). */
  key: string;
}

function cpfValid(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lê o que a pessoa digitou e descobre o tipo. 11 dígitos é CPF só se os dígitos verificadores
 * baterem; senão, telefone (DDD + número). `null` = não é uma chave Pix válida.
 */
export function normalizePixKey(raw: string): PixKey | null {
  const s = raw.trim();
  if (!s || s.length > 77) return null;
  const lower = s.toLowerCase();
  if (EVP.test(lower)) return { type: 'evp', key: lower };
  if (s.includes('@')) return EMAIL.test(lower) ? { type: 'email', key: lower } : null;
  const digits = s.replace(/\D/g, '');
  const onlyNumberish = /^[\d\s().+/-]+$/.test(s);
  if (!onlyNumberish) return null;
  if (s.startsWith('+')) return digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? { type: 'phone', key: `+${digits}` } : null;
  if (digits.length === 14) return { type: 'cnpj', key: digits };
  if (digits.length === 11 && cpfValid(digits)) return { type: 'cpf', key: digits };
  if (digits.length === 10 || digits.length === 11) return { type: 'phone', key: `+55${digits}` };
  return null;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const ch of payload) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** Só ASCII, sem acentos, no tamanho que o BR Code aceita. */
function ascii(s: string, max: number): string {
  const clean = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  return (clean || 'PIX').slice(0, max);
}

/**
 * "Pix copia e cola" com o valor já preenchido (centavos). `name` é quem recebe (o nome no split);
 * a cidade não é conferida pelos bancos num Pix estático entre pessoas.
 */
export function pixCopyPaste(input: { key: string; name: string; amount: number; city?: string }): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', input.key);
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (input.amount > 0 ? field('54', (input.amount / 100).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', ascii(input.name, 25)) +
    field('60', ascii(input.city ?? 'BRASIL', 15)) +
    field('62', field('05', '***')) +
    '6304';
  return body + crc16(body);
}
