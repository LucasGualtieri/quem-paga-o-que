import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProofInfo } from '@qpq/shared';
import { Button, Icon, Sheet } from '../components/index.ts';
import { usePhoto } from '../data/files.ts';
import { useProfile } from '../data/hooks.ts';
import { canSeeProof, dueSharesOf, type ExpenseDoc, type Member, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { useFmt } from '../lib/currency.ts';
import { usePayActions } from './usePayActions.ts';
import { MemberAvatar } from './Photos.tsx';

/** O que a folha de pagamento confirma: parte de despesa, acerto novo ou comprovante depois. */
type PayTarget =
  | { kind: 'share'; expense: ExpenseDoc; memberId: string; attach: boolean }
  | { kind: 'settle'; from: string; to: string; amount: number }
  | { kind: 'payment'; payment: PaymentDoc };

interface ProofView {
  proof: ProofInfo;
  from: string;
  to: string;
  amount: number;
  what: string;
}

function useAskProof(): boolean {
  const session = useSession();
  const profile = useProfile(session.status === 'ready' ? session.uid : null);
  return profile.status === 'ready' && !!profile.data.prefs.askProof;
}

/** Foto do Storage num quadro (carregando, sem permissão, expirada ou com erro). */
export function PhotoBox({ path, alt, tall, fallback }: { path: string | null; alt: string; tall?: boolean; fallback?: ReactNode }) {
  const { t } = useTranslation();
  const photo = usePhoto(path);
  const cls = `receipt ${tall ? 'tall' : ''}`;
  if (photo?.status === 'ready') {
    return (
      <div className={`${cls} has-img`}>
        <img src={photo.url} alt={alt} />
      </div>
    );
  }
  return (
    <div className={cls} role="img" aria-label={alt} aria-busy={photo?.status === 'loading'}>
      <Icon name="camera" size="lg" />
      <span>{photo?.status === 'loading' ? t('photo.loading') : photo?.status === 'error' ? t('photo.error') : fallback}</span>
    </div>
  );
}

/**
 * Marcar pago / Recebi / acerto com a folha de comprovante (preferência `askProof`) e
 * "Enviar comprovante" depois. Devolve as ações e as folhas para pôr na tela.
 */
export function usePayFlow(split: SplitDoc, me: Member, who: (id: string) => string) {
  const { t } = useTranslation();
  const lang = useLang();
  const actions = usePayActions(split, me);
  const askProof = useAskProof();
  const [target, setTarget] = useState<PayTarget | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<ProofView | null>(null);
  const [undo, setUndo] = useState<{ payment: PaymentDoc; covered: readonly ExpenseDoc[] } | null>(null);
  const fmt = useFmt();

  const open = (next: PayTarget) => {
    setFile(null);
    setTarget(next);
  };
  const close = () => setTarget(null);

  const flow = {
    ...actions,
    /** Marcar como pago (ou Recebi): direto, ou pela folha se a pessoa pediu para perguntar. */
    markShare: (expense: ExpenseDoc, memberId: string) => (askProof ? open({ kind: 'share', expense, memberId, attach: false }) : actions.mark(expense, memberId)),
    attachShare: (expense: ExpenseDoc, memberId: string) => open({ kind: 'share', expense, memberId, attach: true }),
    settle: (from: string, to: string, amount: number) => (askProof ? open({ kind: 'settle', from, to, amount }) : actions.settle(from, to, amount)),
    attachPayment: (payment: PaymentDoc) => open({ kind: 'payment', payment }),
    viewProof: (v: ProofView) => setView(v),
    /** Desfazer uma parte paga num acerto (modo detalhado) desfaz o acerto inteiro: a folha diz o que ele cobre. */
    undoSettlement: (payment: PaymentDoc, covered: readonly ExpenseDoc[]) => setUndo({ payment, covered }),
  };

  let sheet: ReactNode = null;
  if (target) {
    const attach = target.kind === 'payment' || (target.kind === 'share' && target.attach);
    const [from, to, amount, ctx] =
      target.kind === 'share'
        ? [target.memberId, target.expense.payer, dueSharesOf(target.expense, split)[target.memberId] ?? 0, t('pay.ctxShare', { expense: target.expense.name, split: split.name })]
        : target.kind === 'settle'
          ? [target.from, target.to, target.amount, t('pay.ctxSettle', { split: split.name })]
          : [target.payment.from, target.payment.to, target.payment.amount, t('pay.ctxSettle', { split: split.name })];
    const iReceive = to === me.id;
    const text =
      from === me.id
        ? t('pay.youPaid', { amount: fmt(amount), to: who(to) })
        : iReceive
          ? t('pay.paidYou', { from: who(from), amount: fmt(amount) })
          : t('pay.paid', { from: who(from), amount: fmt(amount), to: who(to) });
    const title = attach ? t('pay.titleAttach') : iReceive ? t('pay.titleRecv') : t('pay.titlePay');
    const confirm = () => {
      close();
      if (target.kind === 'share') {
        if (target.attach) {
          if (file) actions.attachShare(target.expense, target.memberId, file);
        } else actions.mark(target.expense, target.memberId, file);
      } else if (target.kind === 'settle') actions.settle(target.from, target.to, target.amount, file);
      else if (file) actions.attachPayment(target.payment, file);
    };
    const fromM = split.members[from];
    const toM = split.members[to];
    sheet = (
      <Sheet open title={title} onClose={close}>
        <div className="paysum">
          <span className="avpair" aria-hidden="true">
            <MemberAvatar member={fromM} />
            <Icon name="arrow" size="sm" />
            <MemberAvatar member={toM} />
          </span>
          <span className="mid">
            <span className="sugtxt amt">{text}</span>
            <span className="cap">{ctx}</span>
          </span>
        </div>
        <div className="filerow">
          <label className={`filebtn ${file ? 'on' : ''}`}>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Icon name={file ? 'check' : 'camera'} />
            <span>{file ? t('pay.attached') : attach ? t('pay.choose') : t('pay.attachOptional')}</span>
          </label>
          {file && (
            <button type="button" className="iconbtn" aria-label={t('pay.removeProof')} onClick={() => setFile(null)}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <p className="cap" style={{ textWrap: 'pretty' }}>
          {iReceive ? t('pay.hintRecv') : t('pay.hintPay', { name: who(to) })} {t('pay.retention')}
        </p>
        <div className="sheet-acts">
          <Button block disabled={attach && !file} onClick={confirm}>
            {attach ? t('pay.ctaSend') : file ? t('pay.ctaWith') : t('pay.ctaWithout')}
          </Button>
          <Button variant="ghost" block onClick={close}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    );
  }

  const proofSheet = view && (
    <Sheet open title={t('pay.proofOf', { name: who(view.from) })} onClose={() => setView(null)}>
      <p className="cap amt" style={{ marginTop: -8 }}>
        {t('pay.proofSub', { amount: fmt(view.amount), what: view.what })}
      </p>
      {canSeeProof(split, me, view.from, view.to) ? (
        <PhotoBox path={view.proof.path} alt={t('pay.proofOf', { name: who(view.from) })} tall fallback={t('pay.proofExpired')} />
      ) : (
        <div className="info">
          <Icon name="lock" />
          <span>{t('pay.proofHidden')}</span>
        </div>
      )}
      <Button variant="secondary" block onClick={() => setView(null)}>
        {t('common.close')}
      </Button>
    </Sheet>
  );

  const undoSheet = undo && (
    <Sheet open title={t('pay.undoSettleT')} onClose={() => setUndo(null)}>
      <p className="muted" style={{ textWrap: 'pretty' }}>
        {t('pay.undoSettleB', { amount: fmt(undo.payment.amount), from: who(undo.payment.from), to: who(undo.payment.to), count: undo.covered.length })}
      </p>
      {undo.covered.length > 0 && (
        <ul className="covered">
          {undo.covered.map((e) => (
            <li key={e.id}>{e.name}</li>
          ))}
        </ul>
      )}
      <div className="sheet-acts">
        <Button
          variant="danger"
          block
          onClick={() => {
            actions.undoPayment(undo.payment);
            setUndo(null);
          }}
        >
          {t('pay.undoSettle')}
        </Button>
        <Button variant="ghost" block onClick={() => setUndo(null)}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  );

  return {
    flow,
    sheets: (
      <>
        {sheet}
        {proofSheet}
        {undoSheet}
      </>
    ),
  };
}
