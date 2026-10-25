import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { shares } from '@qpq/calc';
import {
  coverPath,
  PAY_MODES,
  proofPath,
  receiptPath,
  type CreatePaymentResponse,
  type PayMode,
  type PayWriteResponse,
  type ProofInfo,
  type ProofVisibility,
} from '@qpq/shared';
import { db, fail, input, ledgerOf, loadSplit, opts, orderOf, payModeOf, requireAdmin, requireMember, requireOpen, text, touchMoney, uidOf, type Member, type SplitData } from './common.ts';
import { addHistory, loadExpense, requireEditor, type HistoryKind } from './expenses.ts';
import { findPayment, findShare, notify, notifyProof, others, setHidden, setStatus } from './notifications.ts';
import { deleteFiles, newProof, register, requireFile, requirePath, unregister } from './proofs.ts';
import { confirmCovers, coversOf, legacyOf, openShares, readSettlement, undoSettlement, writeCovers, type StoredPayment } from './settle.ts';
import type { Expense, Payment } from '@qpq/calc';

/**
 * Pagamentos (Fase 6, spec 06): parte de despesa e acerto pelo Saldo. Nenhuma mudança
 * aqui é edição da despesa (decisão 8): `version` fica, `paySeq` sobe.
 */

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const VISIBILITY: readonly ProofVisibility[] = ['all', 'involved'];

function memberId(split: SplitData, raw: unknown): string {
  const id = text(raw);
  if (!Object.hasOwn(split.members, id)) fail('invalid-input');
  return id;
}

/** A parte e a despesa, prontas para mexer no pagamento de `memberId`. */
async function loadShare(tx: FirebaseFirestore.Transaction, data: Record<string, unknown>, uid: string) {
  const splitId = text(data.splitId);
  const { split } = await loadSplit(tx, splitId);
  const me = requireMember(split, uid);
  const { ref, e } = await loadExpense(tx, splitId, data.expenseId);
  if (e.deletedAt) fail('expense-missing');
  requireOpen(split);
  const id = memberId(split, data.memberId);
  // Quem pagou nunca tem parte a marcar; quem não tem parte também não.
  const share = id === e.payer ? 0 : (shares(e, orderOf(split))[id] ?? 0);
  if (share <= 0) fail('invalid-input');
  const iAmPayer = me[0] === e.payer;
  const via = (e.via as Record<string, string> | undefined)?.[id];
  return { splitId, split, me, ref, e, id, share, iAmPayer, paid: e.paid?.[id] ?? 0, pending: !!e.pendConf?.[id], proof: e.proof?.[id], via };
}

/** No modo simplificado não se paga por despesa (spec 06). */
function requireDetailed(split: SplitData): void {
  if (payModeOf(split) === 'simple') fail('mode-simple');
}

/** A própria pessoa, quem pagou a despesa ou admin (spec 04). */
function requireShareActor(me: [string, Member], payer: string, id: string): void {
  if (me[0] !== id && me[0] !== payer && !me[1].admin) fail('not-involved');
}

/** Confirmar e "Não recebi": quem pagou a despesa ou admin. */
function requireReceiver(me: [string, Member], payer: string): void {
  if (me[0] !== payer && !me[1].admin) fail('not-involved');
}

async function payWrite(
  tx: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
  e: { paySeq?: number; version: number },
  update: Record<string, unknown>,
  history: { kind: HistoryKind; by: string; memberId: string },
): Promise<number> {
  const paySeq = (e.paySeq ?? 0) + 1;
  tx.update(ref, { ...update, paySeq });
  // Marcar, desmarcar e "Não recebi" mudam o saldo; confirmar e comprovante não.
  if (history.kind !== 'confirmed' && history.kind !== 'proof') touchMoney(tx, ref);
  await addHistory(tx, ref, { seq: e.version, ...history });
  return paySeq;
}

export const markShare = onCall(opts, async (req): Promise<PayWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const paySeq = await db().runTransaction(async (tx) => {
    const s = await loadShare(tx, data, uid);
    requireShareActor(s.me, s.e.payer, s.id);
    requireDetailed(s.split);
    // Já paga: só "Recebi" de quem pagou ainda muda algo (tira a pendência).
    if (s.paid >= s.share && !(s.iAmPayer && s.pending)) return s.e.paySeq ?? 0;
    const notes = await findShare(tx, s.splitId, s.ref.id, s.id);
    // "Recebi" de quem pagou confirma o aviso e resolve contestações antigas (spec 07).
    if (s.iAmPayer) setStatus(tx, notes, ['new', 'disputed'], 'confirmed');
    // Só quem marca a própria parte avisa quem pagou.
    else if (s.me[0] === s.id) notify(tx, s.splitId, s.split, s.e.payer, { kind: 'paid', from: s.id, amount: s.share, expId: s.ref.id, expName: s.e.name as string, memberId: s.id });
    return payWrite(
      tx,
      s.ref,
      s.e,
      // Quem recebe marcando já está confirmando: sem pendência (spec 06).
      {
        [`paid.${s.id}`]: Math.max(s.paid, s.share),
        [`pendConf.${s.id}`]: s.iAmPayer ? FieldValue.delete() : true,
        // Hora do pagamento (linha "Resolvido · …" no Saldo); "Recebi" sobre parte já paga não muda.
        ...(s.paid < s.share ? { [`paidAt.${s.id}`]: Date.now() } : {}),
      },
      { kind: s.iAmPayer ? 'received' : 'paid', by: s.me[0], memberId: s.id },
    );
  });
  return { paySeq };
});

/** Tira o pago, a pendência e o comprovante (Desfazer e "Não recebi"). */
function clearShare(tx: FirebaseFirestore.Transaction, s: Awaited<ReturnType<typeof loadShare>>) {
  unregister(tx, s.proof);
  return {
    [`paid.${s.id}`]: FieldValue.delete(),
    [`paidAt.${s.id}`]: FieldValue.delete(),
    [`pendConf.${s.id}`]: FieldValue.delete(),
    [`proof.${s.id}`]: FieldValue.delete(),
  };
}

export const unmarkShare = onCall(opts, async (req): Promise<PayWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  let file = null as string | null;
  const paySeq = await db().runTransaction(async (tx) => {
    const s = await loadShare(tx, data, uid);
    requireShareActor(s.me, s.e.payer, s.id);
    if (!s.paid && !s.pending && !s.proof) return s.e.paySeq ?? 0;
    // Parte paga no acerto: Desfazer desfaz o acerto inteiro (spec 06).
    if (s.via) {
      const x = await loadSettlement(tx, s.splitId, s.via);
      if (x) {
        file = x.p.proof?.path ?? null;
        setHidden(tx, x.notes, true);
        await undoSettlement(tx, x.ref, x.p, x.read, s.me[0]);
        // O `paySeq` desta despesa sobe junto com as outras que o acerto cobria.
        return (s.e.paySeq ?? 0) + 1;
      }
    }
    const notes = await findShare(tx, s.splitId, s.ref.id, s.id);
    // Quem desfaz o próprio pagamento tira o aviso que ainda esperava confirmação.
    if (s.me[0] === s.id) setHidden(tx, notes, true, (n) => (n.kind === 'paid' || n.kind === 'proof') && n.status === 'new');
    file = s.proof?.path ?? null;
    return payWrite(tx, s.ref, s.e, clearShare(tx, s), { kind: 'unpaid', by: s.me[0], memberId: s.id });
  });
  await deleteFiles([file]);
  return { paySeq };
});

export const confirmShare = onCall(opts, async (req): Promise<PayWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const paySeq = await db().runTransaction(async (tx) => {
    const s = await loadShare(tx, data, uid);
    requireReceiver(s.me, s.e.payer);
    if (!s.pending) fail('not-pending');
    setStatus(tx, await findShare(tx, s.splitId, s.ref.id, s.id), ['new'], 'confirmed');
    return payWrite(tx, s.ref, s.e, { [`pendConf.${s.id}`]: FieldValue.delete() }, { kind: 'confirmed', by: s.me[0], memberId: s.id });
  });
  return { paySeq };
});

/** "Não recebi": desfaz a parte paga e apaga o comprovante (spec 06). */
export const disputeShare = onCall(opts, async (req): Promise<PayWriteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  let file = null as string | null;
  const paySeq = await db().runTransaction(async (tx) => {
    const s = await loadShare(tx, data, uid);
    requireReceiver(s.me, s.e.payer);
    if (!s.pending) fail('not-pending');
    setStatus(tx, await findShare(tx, s.splitId, s.ref.id, s.id), ['new'], 'disputed');
    // Avisa quem marcou que pagou: "o pagamento não chegou".
    notify(tx, s.splitId, s.split, s.id, { kind: 'disputed', from: s.me[0], amount: s.share, expId: s.ref.id, expName: s.e.name as string, memberId: s.id });
    file = s.proof?.path ?? null;
    return payWrite(tx, s.ref, s.e, clearShare(tx, s), { kind: 'disputed', by: s.me[0], memberId: s.id });
  });
  await deleteFiles([file]);
  return { paySeq };
});

function paymentRef(splitId: string, id: unknown) {
  const pid = text(id);
  if (!ID.test(pid)) fail('invalid-input');
  return db().doc(`splits/${splitId}/payments/${pid}`);
}

/** O acerto e o que desfazê-lo precisa ler (as despesas que ele cobre e os acertos que incorporou). */
async function loadSettlement(tx: FirebaseFirestore.Transaction, splitId: string, pid: string) {
  const ref = paymentRef(splitId, pid);
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  const p = snap.data() as StoredPayment;
  return { ref, p, notes: await findPayment(tx, splitId, ref.id), read: await readSettlement(tx, db().doc(`splits/${splitId}`), p) };
}

/** Acerto pelo cartão do Saldo: registra a dívida atual do par (`M`), calculada aqui. */
export const createPayment = onCall(opts, async (req): Promise<CreatePaymentResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  return db().runTransaction(async (tx) => {
    const { ref: splitRef, split } = await loadSplit(tx, splitId);
    const me = requireMember(split, uid);
    const from = memberId(split, data.from);
    const to = memberId(split, data.to);
    if (from === to) fail('invalid-input');
    // Quem está na linha (deve ou recebe) ou admin (spec 04).
    if (me[0] !== from && me[0] !== to && !me[1].admin) fail('not-involved');
    requireOpen(split);
    const ref = paymentRef(splitId, data.id);
    const existing = await tx.get(ref);
    if (existing.exists) return { amount: (existing.data() as StoredPayment).amount };
    const [expenses, payments] = await Promise.all([tx.get(splitRef.collection('expenses')), tx.get(splitRef.collection('payments'))]);
    const money = {
      expenses: expenses.docs.filter((d) => !d.get('deletedAt')).map((d) => d.data() as Expense),
      payments: payments.docs.map((d) => d.data() as Payment),
    };
    const amount = ledgerOf(split, money).M[from]?.[to] ?? 0;
    if (amount <= 0) return { amount: 0 };
    // Quem recebe registrando já está confirmando; senão, fica esperando a confirmação (como na parte).
    const pendConf = me[0] !== to;
    // Modo detalhado: o acerto marca todas as partes em aberto do par, nos dois sentidos (spec 06).
    const detailed = payModeOf(split) === 'detailed';
    const open = detailed ? openShares(split, expenses.docs, from, to) : [];
    const legacy = detailed ? legacyOf(payments.docs, from, to) : [];
    tx.create(ref, { from, to, amount, by: me[0], when: FieldValue.serverTimestamp(), proof: null, pendConf, ...(detailed ? coversOf(open, legacy) : {}) });
    if (detailed) await writeCovers(tx, open, legacy, ref.id, me[0], pendConf ? from : null);
    touchMoney(tx, splitRef);
    // Avisa a outra pessoa do acerto (as duas, se quem registrou foi um admin de fora).
    for (const m of others(me[0], from, to)) notify(tx, splitId, split, m, { kind: 'settled', from: me[0], amount, paymentId: ref.id, payFrom: from, payTo: to });
    return { amount };
  });
});

/** Desfazer acerto: as duas pessoas ou admin. */
export const deletePayment = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  const file = await db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const me = requireMember(split, uid);
    const ref = paymentRef(splitId, data.paymentId);
    const snap = await tx.get(ref);
    if (!snap.exists) fail('payment-missing');
    const p = snap.data() as StoredPayment;
    if (me[0] !== p.from && me[0] !== p.to && !me[1].admin) fail('not-involved');
    requireOpen(split);
    const notes = await findPayment(tx, splitId, ref.id);
    const read = await readSettlement(tx, db().doc(`splits/${splitId}`), p);
    setHidden(tx, notes, true);
    // Acerto do modo detalhado: desmarca as partes que ele marcou.
    await undoSettlement(tx, ref, p, read, me[0]);
    return p.proof?.path ?? null;
  });
  await deleteFiles([file]);
  return {};
});

/** O acerto e quem pode confirmá-lo: quem recebe ou admin. */
async function loadPendingPayment(tx: FirebaseFirestore.Transaction, data: Record<string, unknown>, uid: string) {
  const splitId = text(data.splitId);
  const { split } = await loadSplit(tx, splitId);
  const me = requireMember(split, uid);
  const ref = paymentRef(splitId, data.paymentId);
  const snap = await tx.get(ref);
  if (!snap.exists) fail('payment-missing');
  const p = snap.data() as StoredPayment;
  if (me[0] !== p.to && !me[1].admin) fail('not-involved');
  requireOpen(split);
  if (!p.pendConf) fail('not-pending');
  const notes = await findPayment(tx, splitId, ref.id);
  return { splitId, split, me, ref, p, notes, read: await readSettlement(tx, db().doc(`splits/${splitId}`), p) };
}

/** Confirmar o acerto (quem recebe ou admin). */
export const confirmPayment = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  await db().runTransaction(async (tx) => {
    const x = await loadPendingPayment(tx, data, uid);
    setStatus(tx, x.notes, ['new'], 'confirmed');
    tx.update(x.ref, { pendConf: false });
    confirmCovers(tx, x.ref.id, x.read, x.p);
  });
  return {};
});

/** "Não recebi" no acerto: desfaz o acerto, apaga o comprovante e avisa quem pagou. */
export const disputePayment = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const file = await db().runTransaction(async (tx) => {
    const x = await loadPendingPayment(tx, data, uid);
    setStatus(tx, x.notes, ['new'], 'disputed');
    notify(tx, x.splitId, x.split, x.p.from, { kind: 'disputed', from: x.me[0], amount: x.p.amount, paymentId: x.ref.id, payFrom: x.p.from, payTo: x.p.to });
    await undoSettlement(tx, x.ref, x.p, x.read, x.me[0]);
    return x.p.proof?.path ?? null;
  });
  await deleteFiles([file]);
  return {};
});

/** Enviar comprovante depois (ou logo depois de marcar): só enquanto não houver (spec 04). */
export const attachProof = onCall(opts, async (req): Promise<Partial<PayWriteResponse>> => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  if (data.kind === 'share') {
    const paySeq = await db().runTransaction(async (tx) => {
      const s = await loadShare(tx, data, uid);
      requireShareActor(s.me, s.e.payer, s.id);
      // No simplificado, comprovante só no acerto; no detalhado, parte paga no acerto também.
      requireDetailed(s.split);
      if (s.via) fail('proof-invalid');
      // Expirado (`path: null`) também conta: o prazo de 15 dias não recomeça (decisão 9).
      if (s.proof) fail('proof-exists');
      if (!(s.paid > 0)) fail('proof-invalid');
      const path = requirePath(data.path, proofPath(splitId, s.id, s.e.payer, ''));
      await requireFile(path);
      const notes = await findShare(tx, splitId, s.ref.id, s.id);
      const proof = newProof(path, s.me[0]);
      register(tx, splitId, proof, { kind: 'share', expenseId: s.ref.id, memberId: s.id });
      for (const m of others(s.me[0], s.id, s.e.payer)) {
        notifyProof(tx, splitId, s.split, notes, m, { from: s.me[0], amount: s.share, expId: s.ref.id, expName: s.e.name as string, memberId: s.id }, (n) => n.kind === 'paid' && n.status === 'new');
      }
      return payWrite(tx, s.ref, s.e, { [`proof.${s.id}`]: proof }, { kind: 'proof', by: s.me[0], memberId: s.id });
    });
    return { paySeq };
  }
  if (data.kind !== 'payment') fail('invalid-input');
  await db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const me = requireMember(split, uid);
    requireOpen(split);
    const ref = paymentRef(splitId, data.paymentId);
    const snap = await tx.get(ref);
    if (!snap.exists) fail('payment-missing');
    const p = snap.data() as StoredPayment;
    // No acerto, só as duas pessoas (spec 04).
    if (me[0] !== p.from && me[0] !== p.to) fail('not-involved');
    if (p.proof) fail('proof-exists');
    const path = requirePath(data.path, proofPath(splitId, p.from, p.to, ''));
    await requireFile(path);
    const notes = await findPayment(tx, splitId, ref.id);
    const proof = newProof(path, me[0]);
    register(tx, splitId, proof, { kind: 'payment', paymentId: ref.id });
    tx.update(ref, { proof });
    for (const m of others(me[0], p.from, p.to)) {
      notifyProof(tx, splitId, split, notes, m, { from: me[0], amount: p.amount, paymentId: ref.id, payFrom: p.from, payTo: p.to }, (n) => n.kind === 'settled' && !n.read);
    }
  });
  return {};
});

/** "Quem vê comprovantes" (decisão 9): só admin escolhe. */
export const setProofVisibility = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  if (!VISIBILITY.includes(data.value as ProofVisibility)) fail('invalid-input');
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    requireAdmin(split, uid);
    tx.update(ref, { proofVisibility: data.value });
  });
  return {};
});

/**
 * Modo de registrar pagamentos (spec 06): só admin troca, a qualquer momento, sem mudar o saldo.
 * Do simplificado para o detalhado, cada par já quitado por acertos tem as partes em aberto
 * marcadas como pagas no acerto mais recente do par (que incorpora os outros).
 */
export const setPayMode = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  if (!PAY_MODES.includes(data.mode as PayMode)) fail('invalid-input');
  const mode = data.mode as PayMode;
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    const [me] = requireAdmin(split, uid);
    requireOpen(split);
    if (payModeOf(split) === mode) return;
    if (mode !== 'detailed') return void tx.update(ref, { payMode: mode });
    const [expenses, payments] = await Promise.all([tx.get(ref.collection('expenses')), tx.get(ref.collection('payments'))]);
    const money = {
      expenses: expenses.docs.filter((d) => !d.get('deletedAt')).map((d) => d.data() as Expense),
      payments: payments.docs.map((d) => d.data() as Payment),
    };
    const { M } = ledgerOf(split, money);
    const ids = Object.keys(split.members);
    const plans = [];
    for (const [i, a] of ids.entries()) {
      for (const b of ids.slice(i + 1)) {
        if (M[a]?.[b] || M[b]?.[a]) continue;
        const legacy = legacyOf(payments.docs, a, b);
        if (legacy.length === 0) continue;
        const open = openShares(split, expenses.docs, a, b);
        if (open.length === 0) continue;
        // O acerto mais recente do par passa a ser o que marcou as partes.
        const host = legacy.reduce((x, y) => (millis(y.get('when')) > millis(x.get('when')) ? y : x));
        const rest = legacy.filter((d) => d.id !== host.id);
        const p = host.data() as StoredPayment;
        plans.push({ host, open, rest, pending: p.pendConf ? p.from : null });
      }
    }
    // Todas as leituras acima; daqui para baixo, só escritas.
    tx.update(ref, { payMode: mode });
    for (const x of plans) {
      tx.update(x.host.ref, coversOf(x.open, x.rest));
      await writeCovers(tx, x.open, x.rest, x.host.id, me, x.pending);
    }
  });
  return {};
});

function millis(t: unknown): number {
  return (t as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
}

/** Comprovante (foto) da despesa: quem lançou ou admin; trocar apaga a anterior. Não é edição (sem `version`). */
export const setReceipt = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  const old = await db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const { ref, e } = await loadExpense(tx, splitId, data.expenseId);
    if (e.deletedAt) fail('expense-missing');
    const [me] = requireEditor(split, uid, e.author);
    requireOpen(split);
    // Expirado fica expirado: nem troca nem tira (decisão 9).
    if (e.receipt && e.receipt.path === null) fail('proof-exists');
    let receipt: ProofInfo | null = null;
    if (data.path !== null) {
      const path = requirePath(data.path, receiptPath(splitId, ref.id, ''));
      if (path === e.receipt?.path) return null;
      await requireFile(path);
      receipt = newProof(path, me);
      register(tx, splitId, receipt, { kind: 'receipt', expenseId: ref.id });
    }
    unregister(tx, e.receipt);
    tx.update(ref, { receipt });
    return e.receipt?.path ?? null;
  });
  await deleteFiles([old]);
  return {};
});

/** Capa com foto do split: só admin; `null` volta para o emoji. */
export const setSplitPhoto = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  const old = await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, splitId);
    requireAdmin(split, uid);
    const path = data.path === null ? null : requirePath(data.path, coverPath(splitId, ''));
    if (path === (split.photo ?? null)) return null;
    if (path) await requireFile(path);
    tx.update(ref, { photo: path });
    return split.photo ?? null;
  });
  await deleteFiles([old]);
  return {};
});
