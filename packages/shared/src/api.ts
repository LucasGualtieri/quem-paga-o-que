/**
 * Contrato das Cloud Functions chamáveis (região us-east1).
 * Participantes e papéis só mudam por elas (decisões 3 e 4; docs/plan.md seção 3).
 */

/** Motivo de recusa, em `HttpsError.details.reason`; o app traduz pelo i18n. */
export type ErrorReason =
  | 'invalid-input'
  | 'invalid-code'
  | 'name-taken'
  | 'name-claimed'
  | 'not-member'
  | 'not-admin'
  | 'not-joined'
  | 'last-admin'
  | 'self-action'
  | 'balance-not-zero'
  | 'in-expenses'
  | 'not-guest'
  | 'invalid-recovery'
  | 'invalid-merge'
  | 'merge-choice';

export interface ErrorDetails {
  reason: ErrorReason;
  /** Nome envolvido (nome repetido, pessoa com saldo…). */
  name?: string;
  /** Saldo em centavos, quando o motivo é saldo. */
  amount?: number;
}

export interface CreateSplitRequest {
  name: string;
  emoji: string;
  /** Seu nome neste split (convidado digita; vem preenchido do perfil). */
  selfName: string;
  /** Os outros participantes, só pelo nome. */
  people: string[];
}
export interface CreateSplitResponse {
  splitId: string;
  code: string;
}

export interface PreviewInviteRequest {
  code: string;
}
export interface PreviewMember {
  id: string;
  name: string;
  joinOrder: number;
  /** Outra pessoa já escolheu este nome ("já entrou"). */
  taken: boolean;
}
export interface PreviewInviteResponse {
  splitId: string;
  name: string;
  emoji: string;
  createdByName: string;
  /** Você já está neste split: o app vai direto para ele. */
  alreadyMember: boolean;
  members: PreviewMember[];
}

/** Entrar escolhendo um nome da lista (`memberId`) ou como participante novo (`newName`). */
export type JoinSplitRequest = { code: string; memberId: string } | { code: string; newName: string };
export interface JoinSplitResponse {
  splitId: string;
  memberId: string;
}

export interface SetAdminRequest {
  splitId: string;
  memberId: string;
  admin: boolean;
}
export interface MemberRequest {
  splitId: string;
  memberId: string;
}
export interface SplitRequest {
  splitId: string;
}

/** Link de recuperação do convidado (decisão 6). Só convidado cria; gerar outro revoga o anterior. */
export interface CreateRecoveryResponse {
  token: string;
}
export interface RedeemRecoveryRequest {
  token: string;
}
export interface RedeemRecoveryResponse {
  /** Token de login do Firebase para `signInWithCustomToken`. */
  customToken: string;
}

export interface RegenerateCodeResponse {
  code: string;
}

/**
 * Fusão convidado → conta que já existe (decisão 5), em três passos:
 * `prepareMerge` ainda como convidado; `previewMerge` e `mergeGuest` já na conta.
 */
export interface PrepareMergeResponse {
  token: string;
}
export interface MergeTokenRequest {
  token: string;
}
export interface MergeConflict {
  splitId: string;
  splitName: string;
  emoji: string;
  /** Nome que o convidado escolheu neste split. */
  guest: { id: string; name: string };
  /** Nome que a conta já tinha neste split. */
  account: { id: string; name: string };
}
export interface PreviewMergeResponse {
  /** Splits que vêm junto. */
  splitCount: number;
  /** Splits em que os dois lados têm nome: a pessoa escolhe qual manter. */
  conflicts: MergeConflict[];
}
export interface MergeGuestRequest {
  token: string;
  /** splitId → id do nome que fica, para cada conflito. */
  keep: Record<string, string>;
}
