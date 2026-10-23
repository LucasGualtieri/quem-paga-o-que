/** Limite de tamanho de um nome de participante (o servidor confere). */
export const NAME_MAX = 40;
/** Limite de tamanho do nome do split (2 linhas na tela). */
export const SPLIT_NAME_MAX = 60;

/** Tira espaços das pontas e repetidos. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Chave de comparação de nomes (decisão 3): ignora maiúsculas, acentos e
 * espaços extras. "Lucas", "lúcas " e "LUCAS" são o mesmo nome.
 */
export function nameKey(name: string): string {
  return cleanName(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

export function isValidName(name: string, max = NAME_MAX): boolean {
  const n = cleanName(name);
  return n.length > 0 && n.length <= max;
}

/** O primeiro nome que repete um anterior da lista, ou null. */
export function findDuplicate(names: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const n of names) {
    const k = nameKey(n);
    if (seen.has(k)) return n;
    seen.add(k);
  }
  return null;
}
