import type { ExpenseMode, MemberId, SplitMode, Weights } from '@qpq/calc';
import type { EntryIcon } from './icons.ts';
import type { PixKey } from './pix.ts';

/**
 * Contrato das Cloud Functions chamáveis (região us-east1).
 * Participantes e papéis só mudam por elas (decisões 3 e 4; docs/plan.md seção 3).
 */

/** Motivo de recusa, em `HttpsError.details.reason`; o app traduz pelo i18n. */
export type ErrorReason =
  | 'invalid-input'
  | 'invalid-code'
  /** O split do link ou do convite foi apagado (`splitId` leva à explicação). */
  | 'split-gone'
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
  | 'merge-choice'
  | 'split-done'
  | 'expense-invalid'
  | 'expense-exists'
  | 'expense-missing'
  | 'version-conflict'
  | 'has-payments'
  | 'not-involved'
  | 'not-pending'
  | 'proof-exists'
  | 'proof-invalid'
  | 'payment-missing';

export interface ErrorDetails {
  reason: ErrorReason;
  /** Nome envolvido (nome repetido, pessoa com saldo…). */
  name?: string;
  /** Saldo em centavos, quando o motivo é saldo. */
  amount?: number;
  /** Split apagado, quando o motivo é `split-gone`. */
  splitId?: string;
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

/**
 * Despesas (Fase 5). Só as Functions escrevem: validam com o @qpq/calc, conferem
 * quem pode editar, a versão (decisão 8) e os pagamentos (decisão 7).
 */

export interface ExpenseItemInput {
  /** Nome do item (opcional); aparece no detalhe da despesa. */
  name?: string;
  /** Ícone ou emoji do item; sem escolha, o ícone padrão de item. */
  icon?: EntryIcon | null;
  amount: number;
  members: MemberId[];
  mode?: SplitMode;
  w?: Weights;
}

/** O que a pessoa edita numa despesa. Pagamentos (`paid`, `proof`, `pendConf`) ficam de fora. */
export interface ExpenseInput {
  name: string;
  /** `null` só no modo items: o total passa a ser a soma dos itens. */
  amount: number | null;
  payer: MemberId;
  members: MemberId[];
  mode: ExpenseMode;
  w?: Weights;
  items?: ExpenseItemInput[];
  rest?: MemberId[];
  restMode?: SplitMode;
  restW?: Weights;
  /** AAAA-MM-DD. */
  date: string;
  tags: string[];
  note?: string;
  longDesc?: string;
  /** Ícone ou emoji da despesa; sem escolha, o ícone da tag. */
  icon?: EntryIcon | null;
}

export interface CreateExpenseRequest {
  splitId: string;
  /** Id gerado no aparelho: a despesa já aparece na tela com ele (UX otimista). */
  id: string;
  expense: ExpenseInput;
}
export interface UpdateExpenseRequest {
  splitId: string;
  expenseId: string;
  /** Versão que a pessoa estava editando (decisão 8). */
  expectedVersion: number;
  /** "Salvar a minha por cima": ignora a diferença de versão. */
  force?: boolean;
  expense: ExpenseInput;
}
export interface ExpenseRef {
  splitId: string;
  expenseId: string;
}
export interface ExpenseWriteResponse {
  version: number;
}

/**
 * Pagamentos e comprovantes (Fase 6). Só as Functions escrevem: conferem quem pode
 * (spec 04), o split aberto e calculam o valor pelo @qpq/calc. Nenhum mexe em `version`
 * (decisão 8); cada mudança de pagamento numa despesa sobe `paySeq`.
 */

/** Uma parte de despesa: a de `memberId` na despesa `expenseId`. */
export interface ShareRef {
  splitId: string;
  expenseId: string;
  memberId: string;
}
export interface PayWriteResponse {
  /** `paySeq` da despesa depois da mudança: o app tira a mudança otimista quando o snapshot chega nele. */
  paySeq: number;
}

/** Acerto pelo cartão do Saldo: `from` paga a `to` a dívida atual do par (`M`). Id gerado no aparelho. */
export interface CreatePaymentRequest {
  splitId: string;
  id: string;
  from: string;
  to: string;
}
export interface CreatePaymentResponse {
  /** Centavos registrados (a dívida do par no servidor); 0 = nada a acertar, nada foi gravado. */
  amount: number;
}
export interface PaymentRef {
  splitId: string;
  paymentId: string;
}

/**
 * Comprovante enviado ao Storage (só imagem, até 2 MB). Fica guardado no máximo
 * 15 dias e é apagado ao finalizar o split (decisão 9).
 */
export const PROOF_TTL_DAYS = 15;
export const PROOF_MAX_BYTES = 2 * 1024 * 1024;

/** Quem vê comprovantes de pagamento no split (decisão 9). */
export type ProofVisibility = 'all' | 'involved';

/** Comprovante guardado: `path` some (null) quando expira. */
export interface ProofInfo {
  path: string | null;
  /** Quando foi enviado (ms desde 1970). */
  at: number;
  /** Quem enviou (memberId). */
  by: string;
}

/** Caminho no Storage do comprovante de um pagamento entre `from` e `to` (as regras leem as duas pontas daqui). */
export function proofPath(splitId: string, from: string, to: string, file: string): string {
  return `splits/${splitId}/proofs/${from}/${to}/${file}`;
}
export function receiptPath(splitId: string, expenseId: string, file: string): string {
  return `splits/${splitId}/receipts/${expenseId}/${file}`;
}
export function coverPath(splitId: string, file: string): string {
  return `covers/${splitId}/${file}`;
}
export function avatarPath(uid: string, file: string): string {
  return `users/${uid}/${file}`;
}

export type AttachProofRequest =
  | { splitId: string; kind: 'share'; expenseId: string; memberId: string; path: string }
  | { splitId: string; kind: 'payment'; paymentId: string; path: string };

export interface SetProofVisibilityRequest {
  splitId: string;
  value: ProofVisibility;
}
/** Comprovante (foto) da despesa; `path: null` tira. */
export interface SetReceiptRequest {
  splitId: string;
  expenseId: string;
  path: string | null;
}
/** Capa com foto do split; `path: null` volta para o emoji. */
export interface SetSplitPhotoRequest {
  splitId: string;
  path: string | null;
}

/**
 * Notificações no app (Fase 7, spec 07). Só as Functions criam, em `notifications/{id}`;
 * a pessoa só lê as suas (`to`) e só marca como lida.
 */
export type NotificationKind =
  /** Alguém marcou a própria parte como paga (vai para quem pagou a despesa, com Confirmar). */
  | 'paid'
  /** Acerto registrado pelo Saldo (vai para a outra pessoa do acerto). */
  | 'settled'
  /** Comprovante enviado depois (vai para a outra pessoa do pagamento). */
  | 'proof'
  /** "Não recebi" (vai para quem marcou que pagou). */
  | 'disputed'
  /** Um admin excluiu o split (vai para todos que estavam nele; sem link). */
  | 'splitDeleted';

export type NotificationStatus = 'new' | 'confirmed' | 'disputed';

export interface NotificationData {
  /** UID de quem recebe. */
  to: string;
  /** Participante de quem recebe, no split. */
  toMember: string;
  kind: NotificationKind;
  splitId: string;
  splitName: string;
  /** Quem fez a ação (memberId) e o nome dele naquele momento. */
  from: string;
  fromName: string;
  amount: number;
  hasProof: boolean;
  /** Parte de despesa: a despesa e de quem é a parte. */
  expId: string | null;
  expName: string | null;
  memberId: string | null;
  /** Acerto: o pagamento e as duas pontas. */
  paymentId: string | null;
  payFrom: string | null;
  payTo: string | null;
  read: boolean;
  /** Na notificação "paid": o que quem recebeu fez depois (confirmou ou contestou). */
  status: NotificationStatus;
  /** Despesa excluída ou pagamento desfeito: some da lista (decisão 7); Desfazer traz de volta. */
  hidden: boolean;
}

/** Chave Pix da pessoa (uma na v1); `null` tira. Ver `pix.ts`. */
export interface SetPixKeyRequest {
  key: string | null;
}
export interface SetPixKeyResponse {
  pix: PixKey | null;
}
/** Foto de perfil já enviada ao Storage (users/{uid}/…); `path: null` tira. */
export interface SetProfilePhotoRequest {
  path: string | null;
}

/** Split sem ninguém ligado por este tempo é apagado sozinho. */
export const EMPTY_SPLIT_DAYS = 15;

/**
 * Lápide de um split apagado (`deletedSplits/{id}`), para o link antigo explicar o que houve:
 * excluído por um admin ou apagado por ficar sem ninguém. Qualquer pessoa logada lê pelo id.
 */
export interface DeletedSplitData {
  name: string;
  emoji: string;
  cause: 'admin' | 'empty';
  /** Nome de quem excluiu (só `admin`). */
  byName: string | null;
}
