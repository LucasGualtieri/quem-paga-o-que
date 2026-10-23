import { randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { ledger, type Expense, type JoinOrder, type Payment } from '@qpq/calc';
import {
  cleanName,
  findDuplicate,
  generateCode,
  isCoverEmoji,
  isValidName,
  nameKey,
  parseInvite,
  SPLIT_NAME_MAX,
  type CreateSplitResponse,
  type ErrorDetails,
  type ErrorReason,
  type JoinSplitResponse,
  type PreviewInviteResponse,
} from '@qpq/shared';

const REGION = 'us-east1';
const MAX_PEOPLE = 50;

function db() {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

interface Member {
  name: string;
  nameKey: string;
  uid: string | null;
  admin: boolean;
  joinOrder: number;
  joinedAt: unknown;
  isNew: boolean;
}

interface SplitData {
  name: string;
  emoji: string;
  status: 'open' | 'done';
  code: string;
  createdBy: string;
  members: Record<string, Member>;
  uids: string[];
  adminUids: string[];
  nextJoinOrder: number;
}

const HTTP_CODE: Partial<Record<ErrorReason, FunctionsErrorCode>> = {
  'invalid-input': 'invalid-argument',
  'invalid-code': 'not-found',
  'not-member': 'permission-denied',
  'not-admin': 'permission-denied',
};

/** Recusa com um motivo que o app traduz (`details.reason`). */
function fail(reason: ErrorReason, extra: Omit<ErrorDetails, 'reason'> = {}): never {
  const details: ErrorDetails = { reason, ...extra };
  throw new HttpsError(HTTP_CODE[reason] ?? 'failed-precondition', reason, details);
}

function uidOf(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  return uid;
}

function input(req: CallableRequest): Record<string, unknown> {
  return req.data && typeof req.data === 'object' ? (req.data as Record<string, unknown>) : fail('invalid-input');
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : fail('invalid-input');
}

function newId(): string {
  return db().collection('_').doc().id;
}

/** `uids` e `adminUids` são espelhos de `members`, usados pelas regras. */
function mirrors(members: Record<string, Member>) {
  const linked = Object.values(members)
    .filter((m) => m.uid)
    .sort((a, b) => a.joinOrder - b.joinOrder);
  return {
    members,
    uids: linked.map((m) => m.uid!),
    adminUids: linked.filter((m) => m.admin).map((m) => m.uid!),
  };
}

function memberOf(split: SplitData, uid: string): [string, Member] | null {
  return Object.entries(split.members).find(([, m]) => m.uid === uid) ?? null;
}

/** Admins ligados a alguém, fora `exceptId`. "Sempre ao menos um admin" (decisão 4). */
function otherLinkedAdmins(split: SplitData, exceptId: string): number {
  return Object.entries(split.members).filter(([id, m]) => id !== exceptId && m.admin && m.uid).length;
}

async function loadSplit(tx: Transaction, splitId: unknown): Promise<{ ref: DocumentReference; split: SplitData }> {
  const id = text(splitId);
  if (!id || id.includes('/')) fail('invalid-input');
  const ref = db().doc(`splits/${id}`);
  const snap = await tx.get(ref);
  if (!snap.exists) fail('not-member');
  return { ref, split: snap.data() as SplitData };
}

function requireMember(split: SplitData, uid: string): [string, Member] {
  return memberOf(split, uid) ?? fail('not-member');
}

function requireAdmin(split: SplitData, uid: string): [string, Member] {
  const me = requireMember(split, uid);
  if (!me[1].admin) fail('not-admin');
  return me;
}

function target(split: SplitData, memberId: unknown): Member {
  return split.members[text(memberId)] ?? fail('invalid-input');
}

async function readMoney(tx: Transaction, ref: DocumentReference) {
  const [expenses, payments] = await Promise.all([tx.get(ref.collection('expenses')), tx.get(ref.collection('payments'))]);
  return {
    expenses: expenses.docs.map((d) => d.data() as Expense),
    payments: payments.docs.map((d) => d.data() as Payment),
  };
}

/** Saldo de cada participante, sempre pelo motor compartilhado (@qpq/calc). */
function netOf(split: SplitData, money: { expenses: Expense[]; payments: Payment[] }) {
  const order: JoinOrder = Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
  return ledger({ order, ...money }).net;
}

function appearsIn(expenses: readonly Expense[], memberId: string): boolean {
  return expenses.some(
    (e) =>
      e.payer === memberId ||
      e.members.includes(memberId) ||
      (e.rest ?? []).includes(memberId) ||
      (e.items ?? []).some((it) => it.members.includes(memberId)),
  );
}

async function splitByCode(tx: Transaction, raw: unknown) {
  const code = parseInvite(text(raw)) ?? fail('invalid-code');
  const codeSnap = await tx.get(db().doc(`inviteCodes/${code}`));
  if (!codeSnap.exists) fail('invalid-code');
  const ref = db().doc(`splits/${codeSnap.get('splitId') as string}`);
  const snap = await tx.get(ref);
  if (!snap.exists) fail('invalid-code');
  return { ref, split: snap.data() as SplitData };
}

// invoker público: o navegador chama direto; quem decide é a autenticação e as checagens de cada função.
const opts = { region: REGION, maxInstances: 10, invoker: 'public' as const };

export const createSplit = onCall(opts, async (req): Promise<CreateSplitResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  const name = cleanName(text(data.name));
  const emoji = text(data.emoji);
  const selfName = cleanName(text(data.selfName));
  const people = Array.isArray(data.people) ? data.people.map((p) => cleanName(text(p))) : fail('invalid-input');
  if (!isValidName(name, SPLIT_NAME_MAX) || !isCoverEmoji(emoji) || !isValidName(selfName)) fail('invalid-input');
  if (people.length > MAX_PEOPLE || !people.every((p) => isValidName(p))) fail('invalid-input');
  const dup = findDuplicate([selfName, ...people]);
  if (dup !== null) fail('name-taken', { name: dup });

  const ref = db().collection('splits').doc();
  const now = FieldValue.serverTimestamp();
  const selfId = newId();
  const members: Record<string, Member> = {
    [selfId]: { name: selfName, nameKey: nameKey(selfName), uid, admin: true, joinOrder: 0, joinedAt: now, isNew: false },
  };
  people.forEach((p, i) => {
    members[newId()] = { name: p, nameKey: nameKey(p), uid: null, admin: false, joinOrder: i + 1, joinedAt: null, isNew: false };
  });

  const code = await db().runTransaction(async (tx) => {
    let code = '';
    for (let attempt = 0; ; attempt++) {
      code = generateCode(() => randomInt(0, 2 ** 32) / 2 ** 32);
      if (!(await tx.get(db().doc(`inviteCodes/${code}`))).exists) break;
      if (attempt > 8) throw new HttpsError('unavailable', 'code-space');
    }
    tx.create(db().doc(`inviteCodes/${code}`), { splitId: ref.id });
    tx.create(ref, {
      name,
      emoji,
      status: 'open',
      doneAt: null,
      code,
      createdAt: now,
      createdBy: selfId,
      nextJoinOrder: people.length + 1,
      ...mirrors(members),
    });
    tx.set(db().doc(`users/${uid}`), { displayName: selfName }, { merge: true });
    return code;
  });
  return { splitId: ref.id, code };
});

export const previewInvite = onCall(opts, async (req): Promise<PreviewInviteResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  return db().runTransaction(async (tx) => {
    const { ref, split } = await splitByCode(tx, data.code);
    return {
      splitId: ref.id,
      name: split.name,
      emoji: split.emoji,
      createdByName: split.members[split.createdBy]?.name ?? '',
      alreadyMember: memberOf(split, uid) !== null,
      members: Object.entries(split.members)
        .sort(([, a], [, b]) => a.joinOrder - b.joinOrder)
        .map(([id, m]) => ({ id, name: m.name, joinOrder: m.joinOrder, taken: m.uid !== null && m.uid !== uid })),
    };
  });
});

export const joinSplit = onCall(opts, async (req): Promise<JoinSplitResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  return db().runTransaction(async (tx) => {
    const { ref, split } = await splitByCode(tx, data.code);
    const mine = memberOf(split, uid);
    if (mine) return { splitId: ref.id, memberId: mine[0] };

    const members = { ...split.members };
    const now = FieldValue.serverTimestamp();
    let memberId: string;
    let nextJoinOrder = split.nextJoinOrder;
    if (typeof data.memberId === 'string') {
      memberId = data.memberId;
      const m = members[memberId] ?? fail('invalid-input');
      // Decisão 3: o nome trava para quem o escolheu primeiro.
      if (m.uid) fail('name-claimed', { name: m.name });
      members[memberId] = { ...m, uid, joinedAt: now };
    } else {
      const name = cleanName(text(data.newName));
      if (!isValidName(name)) fail('invalid-input');
      const key = nameKey(name);
      if (Object.values(members).some((m) => m.nameKey === key)) fail('name-taken', { name });
      memberId = newId();
      members[memberId] = { name, nameKey: key, uid, admin: false, joinOrder: nextJoinOrder++, joinedAt: now, isNew: true };
    }
    tx.update(ref, { ...mirrors(members), nextJoinOrder });
    return { splitId: ref.id, memberId };
  });
});

export const setAdmin = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  if (typeof data.admin !== 'boolean') fail('invalid-input');
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    requireAdmin(split, uid);
    const id = text(data.memberId);
    const m = target(split, id);
    if (data.admin && !m.uid) fail('not-joined', { name: m.name });
    if (!data.admin && otherLinkedAdmins(split, id) === 0) fail('last-admin');
    tx.update(ref, mirrors({ ...split.members, [id]: { ...m, admin: data.admin as boolean } }));
  });
  return { ok: true };
});

export const releaseName = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    const [myId] = requireAdmin(split, uid);
    const id = text(data.memberId);
    const m = target(split, id);
    if (id === myId) fail('self-action');
    if (!m.uid) fail('not-joined', { name: m.name });
    // Liberar o nome também tira o admin, para ninguém herdar o papel (decisão 3).
    tx.update(ref, mirrors({ ...split.members, [id]: { ...m, uid: null, admin: false, joinedAt: null } }));
  });
  return { ok: true };
});

export const leaveSplit = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    const [id, m] = requireMember(split, uid);
    const money = await readMoney(tx, ref);
    const net = netOf(split, money)[id] ?? 0;
    // Sem nome: o aviso é para a própria pessoa ("Quite suas contas antes de sair").
    if (net !== 0) fail('balance-not-zero', { amount: net });
    if (m.admin && otherLinkedAdmins(split, id) === 0) fail('last-admin');
    // Decisão 4: sair desvincula; o nome, as despesas e o histórico ficam.
    tx.update(ref, mirrors({ ...split.members, [id]: { ...m, uid: null, admin: false, joinedAt: null } }));
  });
  return { ok: true };
});

export const removeMember = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    const [myId] = requireAdmin(split, uid);
    const id = text(data.memberId);
    const m = target(split, id);
    if (id === myId) fail('self-action');
    const money = await readMoney(tx, ref);
    const net = netOf(split, money)[id] ?? 0;
    if (net !== 0) fail('balance-not-zero', { name: m.name, amount: net });
    if (appearsIn(money.expenses, id)) fail('in-expenses', { name: m.name });
    const { [id]: _removed, ...rest } = split.members;
    tx.update(ref, mirrors(rest));
  });
  return { ok: true };
});
