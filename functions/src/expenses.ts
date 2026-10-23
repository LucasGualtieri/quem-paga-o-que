import { FieldValue } from 'firebase-admin/firestore';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { effectiveAmount, validateExpense, type Expense, type ExpenseMode, type JoinOrder, type SplitMode, type Weights } from '@qpq/calc';
import { cleanName, isValidDate, normalizeTags, type ExpenseWriteResponse, type ProofInfo } from '@qpq/shared';
import { db, fail, input, loadSplit, opts, requireMember, requireOpen, text, uidOf, type Member, type SplitData } from './common.ts';

const MODES: readonly ExpenseMode[] = ['equal', 'frac', 'pct', 'exact', 'items'];
const SPLIT_MODES: readonly SplitMode[] = ['equal', 'frac', 'pct', 'exact'];
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const MAX_ITEMS = 60;

/** Campos de uma despesa como ficam no Firestore (sem undefined). */
interface Clean {
  name: string;
  amount: number;
  payer: string;
  members: string[];
  mode: ExpenseMode;
  date: string;
  tags: string[];
  note: string;
  longDesc: string;
  w?: Weights;
  items?: Array<{ name?: string; amount: number; members: string[]; mode?: SplitMode; w?: Weights }>;
  rest?: string[];
  restMode?: SplitMode;
  restW?: Weights;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail('invalid-input');
}

function ids(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 100) return fail('invalid-input');
  return [...new Set(v.map(text))];
}

function weights(v: unknown): Weights | undefined {
  if (v === undefined || v === null) return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(obj(v))) {
    if (typeof n !== 'number' || !Number.isFinite(n)) fail('invalid-input');
    out[k] = n;
  }
  return out;
}

function splitMode(v: unknown): SplitMode | undefined {
  if (v === undefined || v === null) return undefined;
  return (SPLIT_MODES as readonly unknown[]).includes(v) ? (v as SplitMode) : fail('invalid-input');
}

function optText(v: unknown, max: number): string {
  if (v === undefined || v === null) return '';
  const s = text(v).trim();
  return s.length <= max ? s : fail('invalid-input');
}

/** Lê e limpa o que veio do app; erros de forma viram `invalid-input`. */
function parse(raw: unknown): { clean: Clean; amount: number | null } {
  const d = obj(raw);
  const name = cleanName(text(d.name));
  if (name.length === 0 || name.length > 80) fail('invalid-input');
  const date = text(d.date);
  if (!isValidDate(date)) fail('invalid-input');
  const mode = d.mode as ExpenseMode;
  if (!MODES.includes(mode)) fail('invalid-input');
  if (d.amount !== null && typeof d.amount !== 'number') fail('invalid-input');
  const clean: Clean = {
    name,
    amount: 0,
    payer: text(d.payer),
    members: ids(d.members),
    mode,
    date,
    tags: normalizeTags(Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : []),
    note: optText(d.note, 500),
    longDesc: optText(d.longDesc, 2000),
  };
  const w = weights(d.w);
  if (w && mode !== 'items') clean.w = w;
  if (mode === 'items') {
    if (!Array.isArray(d.items) || d.items.length > MAX_ITEMS) return fail('invalid-input');
    clean.items = d.items.map((raw) => {
      const it = obj(raw);
      if (typeof it.amount !== 'number') fail('invalid-input');
      const item: NonNullable<Clean['items']>[number] = { amount: it.amount, members: ids(it.members) };
      const m = splitMode(it.mode);
      const iw = weights(it.w);
      const itemName = optText(it.name, 60);
      if (itemName) item.name = itemName;
      if (m) item.mode = m;
      if (iw) item.w = iw;
      return item;
    });
    clean.rest = d.rest === undefined ? [] : ids(d.rest);
    const rm = splitMode(d.restMode);
    const rw = weights(d.restW);
    if (rm) clean.restMode = rm;
    if (rw) clean.restW = rw;
  }
  // O valor só é conferido pelo motor; aqui só fixamos o número (itens sem valor = soma).
  const amount = d.amount as number | null;
  clean.amount = effectiveAmount({ ...clean, amount });
  return { clean, amount };
}

/** Despesa pronta para gravar, depois de passar no motor de cálculo. */
function checked(raw: unknown, split: SplitData): Clean {
  const { clean, amount } = parse(raw);
  const order: JoinOrder = Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
  const expense: Expense = { ...clean, amount: clean.mode === 'items' ? amount : clean.amount };
  if (validateExpense(expense, order).length > 0) fail('expense-invalid');
  return clean;
}

export function expenseRef(splitId: string, id: string) {
  if (!ID.test(id)) fail('invalid-input');
  return db().doc(`splits/${splitId}/expenses/${id}`);
}

/** Autor ou admin (spec 04). */
export function requireEditor(split: SplitData, uid: string, authorId: string): [string, Member] {
  const me = requireMember(split, uid);
  if (me[0] !== authorId && !me[1].admin) fail('not-admin');
  return me;
}

export type HistoryKind = 'created' | 'edited' | 'deleted' | 'restored' | 'paid' | 'received' | 'unpaid' | 'confirmed' | 'disputed' | 'proof';

/** Entrada do Histórico; nas de pagamento, `memberId` é de quem é a parte. */
export async function addHistory(
  tx: FirebaseFirestore.Transaction,
  expenseRef_: FirebaseFirestore.DocumentReference,
  entry: { seq: number; kind: HistoryKind; by: string; from?: number; to?: number; memberId?: string },
) {
  tx.create(expenseRef_.collection('history').doc(), { ...entry, at: FieldValue.serverTimestamp() });
}

export const createExpense = onCall(opts, async (req): Promise<ExpenseWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  await db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const [me] = requireMember(split, uid);
    requireOpen(split);
    const clean = checked(data.expense, split);
    const ref = expenseRef(splitId, text(data.id));
    if ((await tx.get(ref)).exists) fail('expense-exists');
    const now = FieldValue.serverTimestamp();
    tx.create(ref, {
      ...clean,
      author: me,
      updatedBy: me,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      paid: {},
      proof: {},
      pendConf: {},
      receipt: null,
      paySeq: 0,
    });
    await addHistory(tx, ref, { seq: 1, kind: 'created', by: me, to: clean.amount });
  });
  return { version: 1 };
});

export async function loadExpense(tx: FirebaseFirestore.Transaction, splitId: string, id: unknown) {
  const ref = expenseRef(splitId, text(id));
  const snap = await tx.get(ref);
  if (!snap.exists) fail('expense-missing');
  return { ref, e: snap.data() as Record<string, unknown> & StoredExpense };
}

/** Despesa como está no Firestore (os campos que as Functions leem). */
export interface StoredExpense extends Expense {
  version: number;
  author: string;
  updatedBy: string;
  amount: number;
  deletedAt: unknown;
  paid: Record<string, number>;
  pendConf: Record<string, boolean>;
  proof: Record<string, ProofInfo>;
  receipt?: ProofInfo | null;
  paySeq?: number;
}

export const updateExpense = onCall(opts, async (req): Promise<ExpenseWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  if (typeof data.expectedVersion !== 'number') fail('invalid-input');
  return db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const { ref, e } = await loadExpense(tx, splitId, data.expenseId);
    if (e.deletedAt) fail('expense-missing');
    const [me] = requireEditor(split, uid, e.author);
    requireOpen(split);
    // Decisão 8: se outra pessoa salvou antes, avisa; "por cima" regrava sobre a versão atual.
    if (e.version !== data.expectedVersion && data.force !== true) {
      fail('version-conflict', { name: split.members[e.updatedBy]?.name ?? '' });
    }
    const clean = checked(data.expense, split);
    const version = e.version + 1;
    const replacement = {
      ...clean,
      // Campos opcionais que a edição removeu precisam sair do documento.
      w: clean.w ?? FieldValue.delete(),
      items: clean.items ?? FieldValue.delete(),
      rest: clean.rest ?? FieldValue.delete(),
      restMode: clean.restMode ?? FieldValue.delete(),
      restW: clean.restW ?? FieldValue.delete(),
      version,
      updatedBy: me,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.update(ref, replacement);
    await addHistory(tx, ref, { seq: version, kind: 'edited', by: me, ...(clean.amount !== e.amount ? { from: e.amount, to: clean.amount } : {}) });
    return { version };
  });
});

export const deleteExpense = onCall(opts, async (req): Promise<ExpenseWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  return db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const { ref, e } = await loadExpense(tx, splitId, data.expenseId);
    const [me] = requireEditor(split, uid, e.author);
    requireOpen(split);
    if (e.deletedAt) return { version: e.version };
    // Decisão 7: com parte paga ou pagamento esperando confirmação, não exclui.
    const paid = Object.values((e.paid ?? {}) as Record<string, number>).some((v) => v > 0);
    const pending = Object.values((e.pendConf ?? {}) as Record<string, unknown>).some(Boolean);
    if (paid || pending) fail('has-payments');
    const version = e.version + 1;
    tx.update(ref, { deletedAt: FieldValue.serverTimestamp(), version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
    await addHistory(tx, ref, { seq: version, kind: 'deleted', by: me });
    return { version };
  });
});

/** Desfazer da exclusão: só se todas as pessoas da despesa ainda estiverem no split. */
export const restoreExpense = onCall(opts, async (req): Promise<ExpenseWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  return db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const { ref, e } = await loadExpense(tx, splitId, data.expenseId);
    const [me] = requireEditor(split, uid, e.author);
    requireOpen(split);
    if (!e.deletedAt) return { version: e.version };
    const order: JoinOrder = Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
    if (validateExpense(e as unknown as Expense, order).length > 0) fail('expense-invalid');
    const version = e.version + 1;
    tx.update(ref, { deletedAt: null, version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
    await addHistory(tx, ref, { seq: version, kind: 'restored', by: me });
    return { version };
  });
});

export type { CallableRequest };
