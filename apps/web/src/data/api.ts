import { httpsCallable } from 'firebase/functions';
import type {
  CreateRecoveryResponse,
  CreateSplitRequest,
  CreateSplitResponse,
  ErrorDetails,
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
  // Contas (decisões 5 e 6).
  createRecoveryLink: callable<Record<string, never>, CreateRecoveryResponse>('createRecoveryLink'),
  revokeRecovery: callable<Record<string, never>, unknown>('revokeRecovery'),
  redeemRecovery: callable<RedeemRecoveryRequest, RedeemRecoveryResponse>('redeemRecovery'),
  prepareMerge: callable<Record<string, never>, PrepareMergeResponse>('prepareMerge'),
  previewMerge: callable<MergeTokenRequest, PreviewMergeResponse>('previewMerge'),
  mergeGuest: callable<MergeGuestRequest, unknown>('mergeGuest'),
};

/** O motivo da recusa enviado pela Function, se houver. */
export function detailsOf(error: unknown): ErrorDetails | null {
  const details = (error as { details?: unknown } | null)?.details;
  return details && typeof details === 'object' && 'reason' in details ? (details as ErrorDetails) : null;
}
