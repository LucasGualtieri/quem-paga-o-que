/** Valor em centavos. Sempre inteiro; só a tela formata em R$. */
export type Cents = number;

/** Id estável do participante no split (não é o UID do usuário). */
export type MemberId = string;

export type SplitMode = 'equal' | 'frac' | 'pct' | 'exact';
export type ExpenseMode = SplitMode | 'items';

/**
 * Valor por pessoa, conforme o modo:
 * - frac: peso (ex.: pedaços de pizza; aceita decimais)
 * - pct: porcentagem (até 4 casas)
 * - exact: centavos
 * - equal: ignorado
 */
export type Weights = Readonly<Record<MemberId, number>>;

/**
 * `joinOrder` de cada participante do split: a ordem de entrada.
 * Decide quem recebe os centavos que sobram (ver docs/spec/pontos-em-aberto.md #1).
 */
export type JoinOrder = Readonly<Record<MemberId, number>>;

export interface Item {
  amount: Cents;
  members: readonly MemberId[];
  mode?: SplitMode;
  w?: Weights;
}

export interface Expense {
  /** `null` só no modo items: o total passa a ser a soma dos itens. */
  amount: Cents | null;
  payer: MemberId;
  members: readonly MemberId[];
  mode: ExpenseMode;
  w?: Weights;
  items?: readonly Item[];
  /** Quem divide o "Resto da compra" (total menos itens). */
  rest?: readonly MemberId[];
  restMode?: SplitMode;
  restW?: Weights;
  /** Centavos já pagos de cada parte (ver docs/spec/pontos-em-aberto.md #2). */
  paid?: Readonly<Record<MemberId, Cents>>;
}

/** O que `shares` precisa: a despesa sem quem pagou nem o que já foi pago. */
export type ShareInput = Omit<Expense, 'payer' | 'paid'>;

/** Pagamento de acerto entre duas pessoas, sem apontar despesa. */
export interface Payment {
  from: MemberId;
  to: MemberId;
  amount: Cents;
}

export type Shares = Record<MemberId, Cents>;
export type Matrix = Record<MemberId, Record<MemberId, Cents>>;

export interface Ledger {
  /** Dívida bruta: `P[a][b]` é o que `a` deve a `b` antes de compensar `P[b][a]`. */
  P: Matrix;
  /** Dívida líquida do par: `max(0, P[a][b] − P[b][a])`. É o que aparece nos cartões do Saldo. */
  M: Matrix;
  /** Saldo de cada pessoa: positivo = a receber, negativo = deve. */
  net: Record<MemberId, Cents>;
  /** Sugestão simplificada; usada só no resumo de Finalizar split. */
  sug: Payment[];
  /** Quantidade de pares com dívida líquida. */
  pairs: number;
}

export type ExpenseErrorCode =
  | 'amount-invalid'
  | 'unknown-member'
  | 'no-members'
  | 'weights-invalid'
  | 'weights-zero'
  | 'pct-not-100'
  | 'exact-mismatch'
  | 'no-items'
  | 'items-exceed-total';

export interface ExpenseError {
  code: ExpenseErrorCode;
  /** Onde está o problema: índice do item, `'rest'` ou ausente (a despesa). */
  scope?: number | 'rest';
}
