import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import type {
  CreateRecoveryResponse,
  MergeConflict,
  PrepareMergeResponse,
  PreviewMergeResponse,
  RedeemRecoveryResponse,
} from '@qpq/shared';
import { auth, db, fail, hashToken, input, isGuest, memberOf, mirrors, opts, secretToken, text, uidOf, type SplitData } from './common.ts';

const MERGE_TTL_MS = 10 * 60 * 1000;

// ---------- Link de recuperação (decisão 6) ----------

/** Revoga os links ativos de um uid e marca o perfil. */
async function revokeAll(uid: string): Promise<void> {
  const active = await db().collection('recoveryTokens').where('uid', '==', uid).where('revokedAt', '==', null).get();
  const batch = db().batch();
  for (const d of active.docs) batch.update(d.ref, { revokedAt: FieldValue.serverTimestamp() });
  batch.set(db().doc(`users/${uid}`), { recovery: { active: false } }, { merge: true });
  await batch.commit();
}

/** Só convidado cria; gerar outro revoga o anterior. Só o hash fica guardado. */
export const createRecoveryLink = onCall(opts, async (req): Promise<CreateRecoveryResponse> => {
  const uid = uidOf(req);
  if (!isGuest(req)) fail('not-guest');
  await revokeAll(uid);
  const { token, hash } = secretToken();
  const now = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.create(db().doc(`recoveryTokens/${hash}`), { uid, createdAt: now, revokedAt: null });
  batch.set(db().doc(`users/${uid}`), { recovery: { active: true, createdAt: now } }, { merge: true });
  await batch.commit();
  return { token };
});

export const revokeRecovery = onCall(opts, async (req) => {
  await revokeAll(uidOf(req));
  return { ok: true };
});

/** Troca o link por um login. Vale várias vezes, até ser revogado ou a conta ser salva. */
export const redeemRecovery = onCall(opts, async (req): Promise<RedeemRecoveryResponse> => {
  const token = text(input(req).token);
  const snap = await db().doc(`recoveryTokens/${hashToken(token)}`).get();
  if (!snap.exists || snap.get('revokedAt') !== null) fail('invalid-recovery');
  const uid = snap.get('uid') as string;
  const user = await auth()
    .getUser(uid)
    .catch(() => null);
  // Conta salva (com Google ou e-mail): o link sem senha deixa de valer.
  if (!user || user.providerData.length > 0) {
    await revokeAll(uid).catch(() => {});
    fail('invalid-recovery');
  }
  return { customToken: await auth().createCustomToken(uid) };
});

// ---------- Fusão convidado → conta existente (decisão 5) ----------

/** Passo 1, ainda como convidado: uma prova curta de que quem vai juntar era este convidado. */
export const prepareMerge = onCall(opts, async (req): Promise<PrepareMergeResponse> => {
  const uid = uidOf(req);
  if (!isGuest(req)) fail('not-guest');
  const { token, hash } = secretToken();
  await db().doc(`mergeTokens/${hash}`).set({ guestUid: uid, expiresAt: Timestamp.fromMillis(Date.now() + MERGE_TTL_MS) });
  return { token };
});

async function guestFromToken(req: CallableRequest): Promise<{ guestUid: string; hash: string; data: Record<string, unknown> }> {
  const uid = uidOf(req);
  const data = input(req);
  const hash = hashToken(text(data.token));
  const snap = await db().doc(`mergeTokens/${hash}`).get();
  const guestUid = snap.get('guestUid') as string | undefined;
  const expiresAt = snap.get('expiresAt') as Timestamp | undefined;
  if (!snap.exists || !guestUid || !expiresAt || expiresAt.toMillis() < Date.now()) fail('invalid-merge');
  if (guestUid === uid || isGuest(req)) fail('invalid-merge');
  return { guestUid, hash, data };
}

async function guestSplits(guestUid: string) {
  return (await db().collection('splits').where('uids', 'array-contains', guestUid).get()).docs;
}

function conflictOf(splitId: string, split: SplitData, guestUid: string, uid: string): MergeConflict | null {
  const guest = memberOf(split, guestUid);
  const account = memberOf(split, uid);
  if (!guest || !account) return null;
  return {
    splitId,
    splitName: split.name,
    emoji: split.emoji,
    guest: { id: guest[0], name: guest[1].name },
    account: { id: account[0], name: account[1].name },
  };
}

/** Passo 2, já na conta: quantos splits vêm junto e onde os dois lados têm nome. */
export const previewMerge = onCall(opts, async (req): Promise<PreviewMergeResponse> => {
  const uid = uidOf(req);
  const { guestUid } = await guestFromToken(req);
  const docs = await guestSplits(guestUid);
  const conflicts = docs.map((d) => conflictOf(d.id, d.data() as SplitData, guestUid, uid)).filter((c) => c !== null);
  return { splitCount: docs.length, conflicts };
});

/** Passo 3: move os nomes do convidado para a conta, resolve conflitos e apaga o convidado. */
export const mergeGuest = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const { guestUid, hash, data } = await guestFromToken(req);
  const keep = (data.keep && typeof data.keep === 'object' ? data.keep : {}) as Record<string, unknown>;

  // Confere todas as escolhas antes de mudar qualquer split.
  const docs = await guestSplits(guestUid);
  for (const d of docs) {
    const c = conflictOf(d.id, d.data() as SplitData, guestUid, uid);
    if (c && keep[d.id] !== c.guest.id && keep[d.id] !== c.account.id) fail('merge-choice');
  }

  for (const d of docs) {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(d.ref);
      const split = snap.data() as SplitData;
      const guest = memberOf(split, guestUid);
      if (!guest) return;
      const members = { ...split.members };
      const account = memberOf(split, uid);
      if (!account) {
        members[guest[0]] = { ...guest[1], uid };
      } else {
        const [keptId, kept] = keep[d.id] === guest[0] ? guest : account;
        const [otherId, other] = keptId === guest[0] ? account : guest;
        // O nome que fica herda o admin: a fusão nunca deixa o split sem admin.
        members[keptId] = { ...kept, uid, admin: kept.admin || other.admin };
        members[otherId] = { ...other, uid: null, admin: false, joinedAt: null };
      }
      tx.update(d.ref, mirrors(members));
    });
  }

  // Preferências da conta valem; o nome do convidado só entra se a conta não tiver um.
  const [guestDoc, accountDoc] = await Promise.all([db().doc(`users/${guestUid}`).get(), db().doc(`users/${uid}`).get()]);
  const guestName = guestDoc.get('displayName') as string | undefined;
  if (guestName && !accountDoc.get('displayName')) await db().doc(`users/${uid}`).set({ displayName: guestName }, { merge: true });

  await revokeAll(guestUid);
  await Promise.all([db().doc(`users/${guestUid}`).delete(), db().doc(`mergeTokens/${hash}`).delete()]);
  await auth()
    .deleteUser(guestUid)
    .catch(() => {});
  return { ok: true };
});
