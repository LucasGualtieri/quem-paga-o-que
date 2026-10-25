import { httpsCallable } from 'firebase/functions';
import type {
  AttachProofRequest,
  CreateExpenseRequest,
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentRef,
  PayWriteResponse,
  SetPixKeyRequest,
  SetPixKeyResponse,
  SetProfilePhotoRequest,
  SetProofVisibilityRequest,
  SetReceiptRequest,
  SetSplitPhotoRequest,
  ShareRef,
  CreateRecoveryResponse,
  CreateSplitRequest,
  CreateSplitResponse,
  ErrorDetails,
  ExpenseRef,
  ExpenseWriteResponse,
  JoinSplitRequest,
  JoinSplitResponse,
  MemberRequest,
  MergeGuestRequest,
  MergeTokenRequest,
  PrepareMergeResponse,
  PreviewMergeResponse,
  RedeemRecoveryRequest,
  RedeemRecoveryResponse,
  RegenerateCodeResponse,
  PreviewInviteRequest,
  PreviewInviteResponse,
  SetAdminRequest,
  SplitRequest,
  UpdateExpenseRequest,
  UpdateSplitRequest,
} from '@qpq/shared';
import { firebase } from '../firebase.ts';

function callable<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => (await httpsCallable<Req, Res>(firebase().functions, name)(data)).data;
}

// Participantes e papéis só mudam por estas Functions (decisões 3 e 4).
export const api = {
  createSplit: callable<CreateSplitRequest, CreateSplitResponse>('createSplit'),
  previewInvite: callable<PreviewInviteRequest, PreviewInviteResponse>('previewInvite'),
  joinSplit: callable<JoinSplitRequest, JoinSplitResponse>('joinSplit'),
  setAdmin: callable<SetAdminRequest, unknown>('setAdmin'),
  releaseName: callable<MemberRequest, unknown>('releaseName'),
  removeMember: callable<MemberRequest, unknown>('removeMember'),
  leaveSplit: callable<SplitRequest, unknown>('leaveSplit'),
  regenerateCode: callable<SplitRequest, RegenerateCodeResponse>('regenerateCode'),
  // Finalizar e reabrir (Fase 8): só admin.
  finalizeSplit: callable<SplitRequest, unknown>('finalizeSplit'),
  deleteSplit: callable<SplitRequest, unknown>('deleteSplit'),
  updateSplit: callable<UpdateSplitRequest, unknown>('updateSplit'),
  reopenSplit: callable<SplitRequest, unknown>('reopenSplit'),
  // Despesas (Fase 5): só as Functions escrevem.
  createExpense: callable<CreateExpenseRequest, ExpenseWriteResponse>('createExpense'),
  updateExpense: callable<UpdateExpenseRequest, ExpenseWriteResponse>('updateExpense'),
  deleteExpense: callable<ExpenseRef, ExpenseWriteResponse>('deleteExpense'),
  restoreExpense: callable<ExpenseRef, ExpenseWriteResponse>('restoreExpense'),
  // Pagamentos e comprovantes (Fase 6): só as Functions escrevem.
  markShare: callable<ShareRef, PayWriteResponse>('markShare'),
  unmarkShare: callable<ShareRef, PayWriteResponse>('unmarkShare'),
  confirmShare: callable<ShareRef, PayWriteResponse>('confirmShare'),
  disputeShare: callable<ShareRef, PayWriteResponse>('disputeShare'),
  createPayment: callable<CreatePaymentRequest, CreatePaymentResponse>('createPayment'),
  deletePayment: callable<PaymentRef, unknown>('deletePayment'),
  confirmPayment: callable<PaymentRef, unknown>('confirmPayment'),
  disputePayment: callable<PaymentRef, unknown>('disputePayment'),
  attachProof: callable<AttachProofRequest, Partial<PayWriteResponse>>('attachProof'),
  setProofVisibility: callable<SetProofVisibilityRequest, unknown>('setProofVisibility'),
  setReceipt: callable<SetReceiptRequest, unknown>('setReceipt'),
  setSplitPhoto: callable<SetSplitPhotoRequest, unknown>('setSplitPhoto'),
  // Contas (decisões 5 e 6).
  createRecoveryLink: callable<Record<string, never>, CreateRecoveryResponse>('createRecoveryLink'),
  revokeRecovery: callable<Record<string, never>, unknown>('revokeRecovery'),
  redeemRecovery: callable<RedeemRecoveryRequest, RedeemRecoveryResponse>('redeemRecovery'),
  prepareMerge: callable<Record<string, never>, PrepareMergeResponse>('prepareMerge'),
  previewMerge: callable<MergeTokenRequest, PreviewMergeResponse>('previewMerge'),
  mergeGuest: callable<MergeGuestRequest, unknown>('mergeGuest'),
  setPixKey: callable<SetPixKeyRequest, SetPixKeyResponse>('setPixKey'),
  setProfilePhoto: callable<SetProfilePhotoRequest, unknown>('setProfilePhoto'),
};

/** O motivo da recusa enviado pela Function, se houver. */
export function detailsOf(error: unknown): ErrorDetails | null {
  const details = (error as { details?: unknown } | null)?.details;
  return details && typeof details === 'object' && 'reason' in details ? (details as ErrorDetails) : null;
}
