/**
 * Preferências só deste aparelho (faixas escondidas com "Agora não"). Sem armazenamento (aba
 * anônima, dados bloqueados), lê nada e não grava: a faixa só some até recarregar.
 */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: fica só na memória da tela.
  }
}
