import { onSchedule } from 'firebase-functions/v2/scheduler';
import { PROOF_TTL_DAYS, type ProofInfo } from '@qpq/shared';
import { bucket, db, fail, hashToken, REGION, type Transaction } from './common.ts';

/**
 * Comprovantes e fotos no Storage (decisão 9). Cada comprovante (de pagamento ou da
 * despesa) ganha um registro em `proofs/{hash do caminho}` para o prazo de 15 dias:
 * a rotina diária apaga a foto e deixa `path: null` ("comprovante expirado").
 */

export type ProofTarget =
  | { kind: 'share'; expenseId: string; memberId: string }
  | { kind: 'payment'; paymentId: string }
  | { kind: 'receipt'; expenseId: string };

const FILE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/;
const DAY = 24 * 60 * 60 * 1000;

/** O caminho é `prefix` + um nome de arquivo simples (sem subpastas nem `..`). */
export function requirePath(path: unknown, prefix: string): string {
  if (typeof path !== 'string' || !path.startsWith(prefix) || !FILE.test(path.slice(prefix.length))) fail('proof-invalid');
  return path;
}

/** A foto já está no Storage (o app envia antes de chamar a Function). */
export async function requireFile(path: string): Promise<void> {
  const [ok] = await bucket().file(path).exists();
  if (!ok) fail('proof-invalid');
}

/** Apaga as fotos depois que a transação gravou (o Storage não entra na transação). */
export async function deleteFiles(paths: ReadonlyArray<string | null | undefined>): Promise<void> {
  await Promise.all(paths.filter((p): p is string => !!p).map((p) => bucket().file(p).delete({ ignoreNotFound: true })));
}

function registryRef(path: string) {
  return db().doc(`proofs/${hashToken(path)}`);
}

export function newProof(path: string, by: string): ProofInfo {
  return { path, at: Date.now(), by };
}

export function register(tx: Transaction, splitId: string, proof: ProofInfo, target: ProofTarget): void {
  if (proof.path) tx.set(registryRef(proof.path), { splitId, path: proof.path, at: proof.at, target });
}

export function unregister(tx: Transaction, proof: ProofInfo | null | undefined): void {
  if (proof?.path) tx.delete(registryRef(proof.path));
}

/** Onde o comprovante fica guardado: o documento e o campo. */
function located(splitId: string, target: ProofTarget): { ref: FirebaseFirestore.DocumentReference; field: string } {
  const split = db().doc(`splits/${splitId}`);
  if (target.kind === 'payment') return { ref: split.collection('payments').doc(target.paymentId), field: 'proof' };
  const ref = split.collection('expenses').doc(target.expenseId);
  return target.kind === 'share' ? { ref, field: `proof.${target.memberId}` } : { ref, field: 'receipt' };
}

/** Marca como expirados (`path: null`) os comprovantes destes registros e tira os registros. */
async function expire(regs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<string[]> {
  for (const reg of regs) {
    const { splitId, path, target } = reg.data() as { splitId: string; path: string; target: ProofTarget };
    await db().runTransaction(async (tx) => {
      const { ref, field } = located(splitId, target);
      const snap = await tx.get(ref);
      if (snap.exists && (snap.get(field) as ProofInfo | null | undefined)?.path === path) tx.update(ref, { [`${field}.path`]: null });
      tx.delete(reg.ref);
    });
  }
  return regs.map((r) => r.get('path') as string);
}

/**
 * Prazo de 15 dias: marca como expirado o que venceu e apaga do Storage tudo o que está em
 * `splits/` há mais tempo, inclusive fotos enviadas e nunca anexadas. Capas e fotos de perfil ficam.
 */
export async function purgeExpiredProofs(now: number): Promise<number> {
  const cutoff = now - PROOF_TTL_DAYS * DAY;
  const due = await db().collection('proofs').where('at', '<', cutoff).get();
  const paths = await expire(due.docs);
  const [files] = await bucket().getFiles({ prefix: 'splits/' });
  const old = files.filter((f) => Date.parse(String(f.metadata.timeCreated ?? '')) < cutoff);
  await deleteFiles([...paths, ...old.map((f) => f.name)]);
  return due.size + old.length;
}

/** Split finalizado: todos os comprovantes dele expiram na hora e as fotos saem do Storage (decisão 9). */
export async function purgeSplitProofs(splitId: string): Promise<void> {
  const regs = await db().collection('proofs').where('splitId', '==', splitId).get();
  const paths = await expire(regs.docs);
  const [files] = await bucket().getFiles({ prefix: `splits/${splitId}/` });
  await deleteFiles([...paths, ...files.map((f) => f.name)]);
}

export const purgeProofs = onSchedule({ schedule: 'every day 04:00', timeZone: 'America/Sao_Paulo', region: REGION }, async () => {
  await purgeExpiredProofs(Date.now());
});
