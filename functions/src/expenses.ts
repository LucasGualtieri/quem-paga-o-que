import { FieldValue } from 'firebase-admin/firestore';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { effectiveAmount, installmentDates, validateExpense, type Expense, type ExpenseMode, type Installments, type JoinOrder, type SplitMode, type Weights } from '@qpq/calc';
import { cleanName, isValidDate, normalizeTags, parseEntryIcon, type EntryIcon, type ExpenseBatchResponse, type ExpenseWriteResponse, type ProofInfo } from '@qpq/shared';
import { findExpense, setHidden } from './notifications.ts';
import { db, fail, input, loadSplit, opts, payModeOf, requireMember, requireOpen, text, today, touchMoney, uidOf, type Member, type SplitData } from './common.ts';

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
  items?: Array<{ name?: string; icon?: EntryIcon; amount: number; members: string[]; mode?: SplitMode; w?: Weights }>;
  rest?: string[];
  icon: EntryIcon | null;
  restMode?: SplitMode;
  restW?: Weights;
  /** Parcelada (spec 05); `null` = à vista. */
  installments: Installments | null;
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

/** Ícone ou emoji (ou automático); qualquer outra coisa é `invalid-input`. */
function iconOf(v: unknown): EntryIcon | null {
  const icon = parseEntryIcon(v);
  return icon === false ? fail('invalid-input') : icon;
}

function optText(v: unknown, max: number): string {
  if (v === undefined || v === null) return '';
  const s = text(v).trim();
  return s.length <= max ? s : fail('invalid-input');
}

/** Parcelas: `{ count, first }` (o motor confere os limites) ou nada. */
function planOf(v: unknown): Installments | null {
  if (v === undefined || v === null) return null;
  const o = obj(v);
  if (typeof o.count !== 'number') fail('invalid-input');
  return { count: o.count, first: text(o.first) };
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
    icon: iconOf(d.icon),
    installments: planOf(d.installments),
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
      const itemIcon = iconOf(it.icon);
      if (itemIcon) item.icon = itemIcon;
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

/**
 * Próximo aviso (spec 07): quando a parcela `instN` vencer, a seguinte entra no saldo. Conta o
 * primeiro vencimento depois de hoje que ainda traz uma parcela nova (o da última não traz).
 * O que já entrou quando a despesa é lançada (ou o plano muda) não gera aviso.
 */
export function nextNotice(plan: Installments | null, day: string): { instNext: string | null; instN: number | null } {
  const dates = plan ? installmentDates(plan).slice(0, -1) : [];
  const i = dates.findIndex((d) => d > day);
  return i < 0 ? { instNext: null, instN: null } : { instNext: dates[i]!, instN: i + 1 };
}

function samePlan(a: Installments | null | undefined, b: Installments | null): boolean {
  return (a?.count ?? 0) === (b?.count ?? 0) && (a?.first ?? '') === (b?.first ?? '');
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

export type HistoryKind = 'created' | 'edited' | 'deleted' | 'restored' | 'paid' | 'received' | 'unpaid' | 'confirmed' | 'disputed' | 'proof' | 'settled' | 'advanced';

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
      ...nextNotice(clean.installments, today()),
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
    touchMoney(tx, ref);
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

/** Despesa com parte paga ou pagamento esperando confirmação não sai (decisão 7). */
function requireNoPayments(e: StoredExpense): void {
  const paid = Object.values(e.paid ?? {}).some((v) => v > 0);
  const pending = Object.values(e.pendConf ?? {}).some(Boolean);
  // O nome diz qual barrou quando são várias (exclusão em lote).
  if (paid || pending) fail('has-payments', { name: e.name ?? '' });
}

/** Despesa como está no Firestore (os campos que as Functions leem). */
export interface StoredExpense extends Expense {
  name?: string;
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
      // Plano novo (ou à vista): os avisos recomeçam do que ainda não venceu.
      ...(samePlan(e.installments, clean.installments) ? {} : nextNotice(clean.installments, today())),
      version,
      updatedBy: me,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.update(ref, replacement);
    touchMoney(tx, ref);
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
    // Decisão 7: com parte paga ou pagamento esperando confirmação, não exclui (só no modo
    // detalhado; no simplificado, excluir é sempre permitido, spec 05).
    if (payModeOf(split) === 'detailed') requireNoPayments(e);
    // Os avisos da despesa somem junto (decisão 7); Desfazer traz de volta.
    setHidden(tx, await findExpense(tx, splitId, ref.id), true);
    const version = e.version + 1;
    tx.update(ref, { deletedAt: FieldValue.serverTimestamp(), version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
    touchMoney(tx, ref);
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
    setHidden(tx, await findExpense(tx, splitId, ref.id), false);
    const version = e.version + 1;
    tx.update(ref, { deletedAt: null, version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
    touchMoney(tx, ref);
    await addHistory(tx, ref, { seq: version, kind: 'restored', by: me });
    return { version };
  });
});

/** Ids de uma ação em lote: de 1 a 100, sem repetir. */
function batchIds(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 100) return fail('invalid-input');
  return [...new Set(v.map(text))];
}

/**
 * Excluir várias despesas de uma vez (seleção na aba Despesas). Tudo ou nada: se uma não puder
 * (não é de quem pede nem admin, ou tem pagamento no modo detalhado), nenhuma sai.
 */
export const deleteExpenses = onCall(opts, async (req): Promise<ExpenseBatchResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  const wanted = batchIds(data.expenseIds);
  return db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    requireOpen(split);
    // Na transação, todas as leituras vêm antes de qualquer escrita.
    const loaded = [];
    for (const id of wanted) {
      const { ref, e } = await loadExpense(tx, splitId, id);
      loaded.push({ ref, e, found: e.deletedAt ? null : await findExpense(tx, splitId, ref.id) });
    }
    const detailed = payModeOf(split) === 'detailed';
    let me = '';
    for (const { e } of loaded) {
      [me] = requireEditor(split, uid, e.author);
      if (detailed && !e.deletedAt) requireNoPayments(e);
    }
    const versions: Record<string, number> = {};
    for (const { ref, e, found } of loaded) {
      if (!found) {
        versions[ref.id] = e.version;
        continue;
      }
      setHidden(tx, found, true);
      const version = e.version + 1;
      tx.update(ref, { deletedAt: FieldValue.serverTimestamp(), version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
      await addHistory(tx, ref, { seq: version, kind: 'deleted', by: me });
      versions[ref.id] = version;
    }
    if (loaded.some((x) => x.found)) touchMoney(tx, loaded[0]!.ref);
    return { versions };
  });
});

/** Desfazer da exclusão em lote: tudo ou nada, como restoreExpense para cada uma. */
export const restoreExpenses = onCall(opts, async (req): Promise<ExpenseBatchResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  const wanted = batchIds(data.expenseIds);
  return db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    requireOpen(split);
    const loaded = [];
    for (const id of wanted) {
      const { ref, e } = await loadExpense(tx, splitId, id);
      loaded.push({ ref, e, found: e.deletedAt ? await findExpense(tx, splitId, ref.id) : null });
    }
    const order: JoinOrder = Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
    let me = '';
    for (const { e } of loaded) {
      [me] = requireEditor(split, uid, e.author);
      if (e.deletedAt && validateExpense(e as unknown as Expense, order).length > 0) fail('expense-invalid', { name: e.name ?? '' });
    }
    const versions: Record<string, number> = {};
    for (const { ref, e, found } of loaded) {
      if (!found) {
        versions[ref.id] = e.version;
        continue;
      }
      setHidden(tx, found, false);
      const version = e.version + 1;
      tx.update(ref, { deletedAt: null, version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
      await addHistory(tx, ref, { seq: version, kind: 'restored', by: me });
      versions[ref.id] = version;
    }
    if (loaded.some((x) => x.found)) touchMoney(tx, loaded[0]!.ref);
    return { versions };
  });
});

export type { CallableRequest };
