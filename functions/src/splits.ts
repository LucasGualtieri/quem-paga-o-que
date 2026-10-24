import { randomInt } from 'node:crypto';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { purgeSplitProofs } from './proofs.ts';
import type { Expense, Payment } from '@qpq/calc';
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
  type JoinSplitResponse,
  type PreviewInviteResponse,
  type RegenerateCodeResponse,
} from '@qpq/shared';
import {
  db,
  fail,
  input,
  ledgerOf,
  loadSplit,
  memberOf,
  mirrors,
  newId,
  opts,
  passAdmin,
  pixOf,
  readMoney,
  requireAdmin,
  requireMember,
  target,
  text,
  uidOf,
  type Member,
  type SplitData,
} from './common.ts';

const MAX_PEOPLE = 50;

/** Saldo de cada participante, sempre pelo motor compartilhado (@qpq/calc). */
function netOf(split: SplitData, money: { expenses: Expense[]; payments: Payment[] }) {
  return ledgerOf(split, money).net;
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

/** Código de convite ainda não usado (lido dentro da transação). */
async function freshCode(tx: Transaction): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode(() => randomInt(0, 2 ** 32) / 2 ** 32);
    if (!(await tx.get(db().doc(`inviteCodes/${code}`))).exists) return code;
  }
  throw new HttpsError('unavailable', 'code-space');
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
    const pix = await pixOf(tx, uid);
    if (pix) members[selfId] = { ...members[selfId]!, pix };
    const code = await freshCode(tx);
    tx.create(db().doc(`inviteCodes/${code}`), { splitId: ref.id });
    tx.create(ref, {
      name,
      emoji,
      status: 'open',
      doneAt: null,
      code,
      photo: null,
      proofVisibility: 'all',
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
    const pix = await pixOf(tx, uid);

    const members = { ...split.members };
    const now = FieldValue.serverTimestamp();
    let memberId: string;
    let nextJoinOrder = split.nextJoinOrder;
    if (typeof data.memberId === 'string') {
      memberId = data.memberId;
      const m = members[memberId] ?? fail('invalid-input');
      // Decisão 3: o nome trava para quem o escolheu primeiro.
      if (m.uid) fail('name-claimed', { name: m.name });
      members[memberId] = { ...m, uid, joinedAt: now, pix };
    } else {
      const name = cleanName(text(data.newName));
      if (!isValidName(name)) fail('invalid-input');
      const key = nameKey(name);
      if (Object.values(members).some((m) => m.nameKey === key)) fail('name-taken', { name });
      memberId = newId();
      members[memberId] = { name, nameKey: key, uid, admin: false, joinOrder: nextJoinOrder++, joinedAt: now, isNew: true, pix };
    }
    // Split sem admin (o último saiu sem ninguém para herdar): quem entra vira admin (decisão 4).
    if (!Object.values(members).some((m) => m.admin && m.uid)) members[memberId] = { ...members[memberId]!, admin: true };
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
    const members = { ...split.members, [id]: { ...m, admin: data.admin as boolean } };
    // Deixar de ser admin sendo o último: o papel passa para quem entrou primeiro (decisão 4).
    tx.update(ref, mirrors(data.admin ? members : passAdmin(members, id)));
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
    tx.update(ref, mirrors({ ...split.members, [id]: { ...m, uid: null, admin: false, joinedAt: null, pix: null } }));
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
    // Decisão 4: sair desvincula; o nome, as despesas e o histórico ficam. Sendo o último
    // admin, o papel passa para quem entrou primeiro entre os que ficam.
    tx.update(ref, mirrors(passAdmin({ ...split.members, [id]: { ...m, uid: null, admin: false, joinedAt: null, pix: null } }, id)));
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

/**
 * Finalizar (só admin, spec 04): ninguém lança, edita nem marca pagamentos (as Functions já
 * recusam com `split-done`), e os comprovantes do split são apagados na hora (decisão 9).
 */
export const finalizeSplit = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, splitId);
    requireAdmin(split, uid);
    if (split.status === 'done') return;
    tx.update(ref, { status: 'done', doneAt: FieldValue.serverTimestamp() });
  });
  // Também se já estava finalizado: termina de apagar o que uma tentativa anterior não apagou.
  await purgeSplitProofs(splitId);
  return {};
});

/** Reabrir (só admin): volta a aceitar despesas e pagamentos; comprovantes apagados não voltam. */
export const reopenSplit = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    requireAdmin(split, uid);
    if (split.status === 'open') return;
    tx.update(ref, { status: 'open', doneAt: null });
  });
  return {};
});

/** "Gerar novo código" (decisão 6): o antigo para na hora; quem já entrou continua. */
export const regenerateCode = onCall(opts, async (req): Promise<RegenerateCodeResponse> => {
  const uid = uidOf(req);
  const data = input(req);
  return db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    requireAdmin(split, uid);
    const code = await freshCode(tx);
    tx.delete(db().doc(`inviteCodes/${split.code}`));
    tx.create(db().doc(`inviteCodes/${code}`), { splitId: ref.id });
    tx.update(ref, { code });
    return { code };
  });
});
