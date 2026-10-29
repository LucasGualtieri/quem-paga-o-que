import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Button, Icon, InfoTip, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { pairsView, type PairCard, type PairEntry } from '../data/balance.ts';
import { canSeeProof, currencyOf, membersInOrder, payModeOf, type ExpenseDoc, type Member, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, dayMonth, shortDayTime } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { safeGet, safeSet } from '../lib/storage.ts';
import { EmptyArt, useBalanceView, useWho } from './common.tsx';
import { coveredExpenses } from '../data/settlements.ts';
import { EntryIconView } from './EntryIcon.tsx';
import type { usePayFlow } from './PaySheet.tsx';
import { CopyPixButton, PixSheet } from './Pix.tsx';
import { useReasonText } from './reasons.ts';
import { MemberAvatar } from './Photos.tsx';

type Flow = ReturnType<typeof usePayFlow>['flow'];

/** "Resolvido · agora": hora do acerto (há menos de 1 minuto, "agora"). */
function useWhen() {
  const { t } = useTranslation();
  const lang = useLang();
  return (d: Date | null) => (!d || Date.now() - d.getTime() < 60_000 ? t('pay.now') : shortDayTime(d, lang));
}

/** Troca discreta do número: alterna a classe para o fade de 4 px rodar de novo (spec 06). */
function useFlash(value: number): string {
  const [cls, setCls] = useState('');
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    setCls((c) => (c === 'flashA' ? 'flashB' : 'flashA'));
  }, [value]);
  return cls;
}

interface Props {
  split: SplitDoc;
  me: Member;
  expenses: readonly ExpenseDoc[];
  payments: readonly PaymentDoc[];
  flow: Flow;
}

/**
 * Meu saldo (spec 06): seu saldo e um cartão por pessoa com o saldo do par. Devo: Copiar Pix
 * e Marcar como pago (o saldo do par, num acerto); me devem: Recebi; quitado, neutro. Aberto, o
 * cartão lista as despesas e os acertos que formam o saldo. Admin vê como qualquer pessoa.
 */
export function MyViewTab({ split, me, expenses, payments, flow }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const who = useWho(split, me);
  const when = useWhen();
  const view = useBalanceView();
  const [chosen, setChosen] = useState(me.id);
  const viewAsId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const viewer = me.admin && split.members[chosen] ? chosen : me.id;
  const self = viewer === me.id;
  const v = pairsView(split, expenses, payments, viewer);
  const flash = useFlash(v.mine);
  const isOpen = split.status === 'open';
  const toast = useToast();
  const reasonText = useReasonText();
  // Incentivo ao Pix (spec 06): cartão para quem tem a receber sem chave; "Agora não" vale neste split.
  const nudgeKey = `qpq.pixNudge.${split.id}`;
  const [nudgeHidden, setNudgeHidden] = useState(() => safeGet(nudgeKey) === '1');
  const [pixSaved, setPixSaved] = useState(false);
  // O pedido de quem deve (sino) abre esta aba com ?pix=1: a folha já vem aberta.
  const [params, setParams] = useSearchParams();
  const [pixOpen, setPixOpen] = useState(params.get('pix') === '1');
  const closePix = () => {
    setPixOpen(false);
    if (params.has('pix')) setParams({}, { replace: true });
  };
  // "Pedir chave Pix": vale na hora; volta, com aviso, se o servidor recusar.
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());
  // Simplificado: paga-se só o saldo do par; as despesas do cartão são só leitura (spec 06).
  const simple = payModeOf(split) === 'simple';
  const fmt = (c: number) => formatCents(c, lang, { currency: currencyOf(split) });
  // Pix só existe em reais: em outra moeda, nada de chave, Copiar Pix nem pedido.
  const pix = currencyOf(split) === 'BRL';
  const showNudge = pix && self && isOpen && v.mine > 0 && !me.pix && !pixSaved && !nudgeHidden;
  const signed = (c: number) => formatCents(c, lang, { signed: true, currency: currencyOf(split) });
  const nameOf = (id: string) => split.members[id]?.name ?? '?';
  const askPix = (o: string) => {
    setAsked((s) => new Set(s).add(o));
    toast.show({ text: t('pix.askedTo', { name: nameOf(o) }) });
    api.requestPix({ splitId: split.id, to: o }).catch((error: unknown) => {
      setAsked((s) => {
        const next = new Set(s);
        next.delete(o);
        return next;
      });
      toast.show({ kind: 'error', text: reasonText(detailsOf(error)) });
    });
  };
  // "você deve…" só quando é a própria pessoa e ela prefere "Você" ao nome.
  const asYou = self && who(me.id) !== nameOf(me.id);

  if (expenses.length === 0 && payments.length === 0) {
    return (
      <div className="content with-tabs">
        <div className="empty" style={{ paddingTop: 50 }}>
          <EmptyArt />
          <h2 className="h2">{t('split.txEmpty')}</h2>
        </div>
      </div>
    );
  }

  // Parte em aberto no presente ("você deve"); compensada ou paga no acerto, no passado ("você devia").
  const debtText = (debtor: string, creditor: string, past: boolean) => {
    const [owe, owed, gen] = past ? (['my.eOwe', 'my.eOwed', 'my.eGen'] as const) : (['my.eOweNow', 'my.eOwedNow', 'my.eGenNow'] as const);
    return asYou ? (debtor === viewer ? t(owe, { name: nameOf(creditor) }) : t(owed, { name: nameOf(debtor) })) : t(gen, { from: nameOf(debtor), to: nameOf(creditor) });
  };
  const paidText = (from: string, to: string) =>
    asYou ? (from === viewer ? t('my.ePaidOut', { name: nameOf(to) }) : t('my.ePaidIn', { name: nameOf(from) })) : t('my.ePaidGen', { from: nameOf(from), to: nameOf(to) });
  const proofNote = (proof: { path: string | null } | null | undefined) => (proof ? (proof.path ? t('my.withProof') : t('my.expired')) : '');

  const caption = (c: PairCard) => {
    const base =
      c.status === 'zero' ? t('my.cZero') : self ? (c.status === 'owe' ? t('my.cOwe') : t('my.cOwed')) : c.status === 'owe' ? t('my.cOweOf', { name: nameOf(viewer) }) : t('my.cOwedOf', { name: nameOf(viewer) });
    return c.toConfirm ? `${base} · ${t('my.toConfirm', { count: c.toConfirm })}` : base;
  };

  const small = (label: string, onClick: () => void, variant: 'primary' | 'secondary' | 'ghost' = 'secondary') => (
    <Button size="sm" variant={variant} onClick={onClick}>
      {label}
    </Button>
  );

  /** Linha resolvida (cinza, tracejada): câmera para ver ou enviar comprovante, e Desfazer. */
  const resolved = (key: string, icon: ReactNode, title: string, note: string, amount: number, camera: { view: boolean; onClick: () => void } | null, onUndo: (() => void) | null, acts?: ReactNode) => (
    <div key={key} className="pcentry done">
      <div className="pcline done">
        {icon}
        <span className="mid">
          <span className="ttl">{title}</span>
          <span className="cap" style={{ whiteSpace: 'normal' }}>
            {note}
          </span>
        </span>
        <span className="side">
          <span className="amt strong">{fmt(amount)}</span>
          <span className="sideacts">
            {camera && (
              <button type="button" className="iconbtn" aria-label={camera.view ? t('pay.seeProof') : t('pay.sendProof')} title={camera.view ? t('pay.seeProof') : t('pay.sendProof')} onClick={camera.onClick}>
                <Icon name="camera" size="sm" />
              </button>
            )}
            {onUndo && (
              <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={onUndo}>
                {t('common.undo')}
              </button>
            )}
          </span>
        </span>
      </div>
      {acts && <div className="pcact">{acts}</div>}
    </div>
  );

  const entry = (c: PairCard, x: PairEntry) => {
    if (x.kind === 'payment') {
      // Acerto: só as duas pessoas anexam; as duas ou admin desfazem (spec 04).
      const p = x.payment;
      const party = p.from === me.id || p.to === me.id;
      const camera = p.proof?.path ? { view: true, onClick: () => flow.viewProof({ proof: p.proof!, from: p.from, to: p.to, amount: p.amount, what: t('my.settle') }) } : isOpen && !p.proof && party ? { view: false, onClick: () => flow.attachPayment(p) } : null;
      // Acerto que marcou as partes: desfazer desmarca todas, então a folha avisa quais.
      const undo = p.viaShares ? () => flow.undoSettlement(p, coveredExpenses(p, expenses)) : () => flow.undoPayment(p);
      const waiting = p.pendConf ? ` · ${t('my.waiting', { name: nameOf(p.to) })}` : '';
      const icon = (
        <span className="dir zero" aria-hidden="true">
          <Icon name="swap" size="sm" />
        </span>
      );
      return resolved(`p-${p.id}`, icon, t('my.settle'), `${paidText(p.from, p.to)} · ${when(p.when)}${proofNote(p.proof)}${waiting}`, p.amount, camera, isOpen ? undo : null);
    }
    const e = x.expense;
    const icon = <EntryIconView icon={e.icon} fallback={{ tags: e.tags }} size="sm" />;
    const day = dayMonth(dateOf(e.date), lang);
    if (x.state === 'paid' && x.via) {
      // Paga num acerto (modo detalhado): "Paga no acerto" ou "Compensada no acerto"; Desfazer desfaz o acerto.
      const p = payments.find((q) => q.id === x.via);
      const label = p?.from === x.debtor ? t('expense.detail.paidSettle') : t('expense.detail.offsetSettle');
      const note = `${debtText(x.debtor, x.creditor, true)} · ${label}${x.paidAt ? ` · ${when(x.paidAt)}` : ''}`;
      return resolved(`s-${e.id}`, icon, e.name, note, x.share, null, isOpen && p ? () => flow.undoSettlement(p, coveredExpenses(p, expenses)) : null);
    }
    if (x.state === 'paid') {
      // Parte paga: as duas pessoas ou admin desfazem e anexam (spec 04). No simplificado, comprovante só no acerto.
      const proof = e.proof[x.debtor];
      const camera = proof?.path && canSeeProof(split, me, x.debtor, x.creditor) ? { view: true, onClick: () => flow.viewProof({ proof, from: x.debtor, to: x.creditor, amount: x.share, what: e.name }) } : isOpen && !proof && !simple ? { view: false, onClick: () => flow.attachShare(e, x.debtor) } : null;
      const wait = x.pending ? ` · ${x.creditor === viewer ? t('my.marked', { name: nameOf(x.debtor) }) : t('my.waiting', { name: nameOf(x.creditor) })}` : '';
      const acts =
        isOpen && x.pending && x.creditor === viewer ? (
          <>
            {small(t('pay.notRecv'), () => flow.dispute(e, x.debtor), 'ghost')}
            {small(t('pay.confirmShort'), () => flow.confirm(e, x.debtor), 'primary')}
          </>
        ) : undefined;
      return resolved(`s-${e.id}`, icon, e.name, `${paidText(x.debtor, x.creditor)} · ${x.paidAt ? when(x.paidAt) : day}${proofNote(proof)}${wait}`, x.share, camera, isOpen ? () => flow.unmark(e, x.debtor) : null, acts);
    }
    const owe = x.debtor === viewer;
    const tone = x.state === 'offset' ? 'zero' : owe ? 'neg' : 'pos';
    return (
      <div key={`s-${e.id}`} className="pcentry">
        <div className="pcline">
          {icon}
          <span className="mid">
            <span className="ttl">{e.name}</span>
            <span className="cap" style={{ whiteSpace: 'normal' }}>
              {debtText(x.debtor, x.creditor, x.state === 'offset')} · {day}
              {x.state === 'offset' && (
                <>
                  {' · '}
                  {/* O "?" nunca vai sozinho para a linha de baixo. */}
                  <span className="nowrap">
                    {t('my.offset')} <InfoTip inline label={t('tips.offsetLabel')} text={t('tips.offset')} />
                  </span>
                </>
              )}
            </span>
          </span>
          <span className="side">
            <span className={`amt strong ${tone}`}>{signed(owe ? -x.due : x.due)}</span>
          </span>
        </div>
        {isOpen && !simple && x.state === 'open' && <div className="pcact">{owe ? small(t('pay.markPaid'), () => flow.markShare(e, viewer)) : small(t('pay.gotIt'), () => flow.markShare(e, c.other))}</div>}
      </div>
    );
  };

  const cardOpen = (id: string) => open[id] ?? false;
  const allOpen = v.cards.every((c) => cardOpen(c.other));
  const mine = view(v.mine);
  const balCap = self ? (v.mine > 0 ? t('my.owed') : v.mine < 0 ? t('my.owe') : t('my.square')) : (v.mine > 0 ? t('my.owedOf', { name: nameOf(viewer) }) : v.mine < 0 ? t('my.oweOf', { name: nameOf(viewer) }) : t('my.squareOf', { name: nameOf(viewer) }));

  return (
    <div className="content with-tabs" style={{ gap: 18 }}>
      {me.admin && (
        <div className="viewas">
          <div className="viewas-field">
            <label className="cap" htmlFor={viewAsId}>
              {t('my.viewAs')}
            </label>
            {/* Só admin vê esta opção: a explicação destaca "admins" no lilás do selo de Admin. */}
            <InfoTip label={t('tips.viewAsLabel')} text={<Trans i18nKey="tips.viewAs" components={{ b: <span className="tip-admin" /> }} />} />
            <span className="viewas-sel">
              <select id={viewAsId} value={viewer} onChange={(e) => setChosen(e.target.value)}>
                {membersInOrder(split).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === me.id ? t('common.you') : m.name}
                  </option>
                ))}
              </select>
              <Icon name="down" size="sm" />
            </span>
          </div>
          {!self && (
            <div className="banner viewbanner" role="status">
              <Icon name="user" size="sm" />
              <span style={{ flex: 1 }}>{t('my.viewingAs', { name: nameOf(viewer) })}</span>
              <button type="button" className="linkbtn" onClick={() => setChosen(me.id)}>
                {t('my.backToYou')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }} aria-live="polite">
        <p className="cap" style={{ fontWeight: 700 }}>
          {self ? t('my.yourBal') : t('my.theirBal', { name: nameOf(viewer) })}
        </p>
        <div className={`bigbal ${flash}`}>
          <span className={`balico ${mine.tone}`} aria-hidden="true">
            <Icon name={mine.icon} />
          </span>
          <span>
            <span className={`num amt ${mine.tone}`}>{v.mine === 0 ? fmt(0) : signed(v.mine)}</span>
            <span className="balcap" style={{ display: 'block' }}>
              {balCap}
            </span>
          </span>
        </div>
      </div>

      {showNudge && (
        <div className="banner fin-suggest pix-nudge" role="status">
          <Icon name="pix" />
          <span className="mid">
            <span className="ttl">{t('pix.nudgeT')}</span>
            <span className="cap">{t('pix.nudgeB')}</span>
            <span className="fin-suggest-acts">
              <Button size="sm" onClick={() => setPixOpen(true)}>
                {t('pix.nudgeCta')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  safeSet(nudgeKey, '1');
                  setNudgeHidden(true);
                }}
              >
                {t('pix.nudgeLater')}
              </Button>
            </span>
          </span>
        </div>
      )}
      <PixSheet open={pix && pixOpen && self && !me.pix && !pixSaved} onClose={closePix} onSaved={() => setPixSaved(true)} onFailed={() => setPixSaved(false)} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="sec-h" style={{ paddingBottom: 0, alignItems: 'center' }}>
          <h2 className="h4">{t('my.byPerson')}</h2>
          <button type="button" className="linkbtn" onClick={() => setOpen(Object.fromEntries(v.cards.map((c) => [c.other, !allOpen])))}>
            {allOpen ? t('my.collapseAll') : t('my.expandAll')}
          </button>
        </div>
        {v.cards.every((c) => c.status === 'zero') && (
          <div className="info">
            <Icon name="check" />
            <span>{self ? t('my.allSettled') : t('my.allSettledOf', { name: nameOf(viewer) })}</span>
          </div>
        )}
        {v.cards.map((c) => {
          const o = c.other;
          const opened = cardOpen(o);
          const tone = c.status === 'owe' ? 'neg' : c.status === 'owed' ? 'pos' : 'zero';
          // Acertos que a pessoa registrou para quem está vendo: Confirmar ou "Não recebi".
          const toCheck = c.entries.flatMap((x) => (x.kind === 'payment' && !x.out && x.payment.pendConf ? [x.payment] : []));
          return (
            <div key={o} className={`pcard ${c.status === 'zero' ? 'zero' : ''}`}>
              <button type="button" className="pchead" aria-expanded={opened} onClick={() => setOpen((s) => ({ ...s, [o]: !opened }))}>
                <MemberAvatar member={split.members[o]} />
                <span className="mid">
                  <span className="ttl">{who(o)}</span>
                  <span className="cap">{caption(c)}</span>
                </span>
                <span className="right">
                  {c.status === 'zero' ? (
                    <span className="zerotag">
                      <Icon name="check" size="sm" />
                      {t('balance.settled')}
                    </span>
                  ) : (
                    <span className={`amt strong ${tone}`}>{signed(c.status === 'owe' ? -c.amount : c.amount)}</span>
                  )}
                </span>
                <Icon name="down" size="sm" className={opened ? 'up' : ''} />
              </button>
              {isOpen && c.status !== 'zero' && (
                <div className="pcmain">
                  {c.status === 'owe' ? (
                    <>
                      {pix && self && <CopyPixButton split={split} to={o} amount={c.amount} />}
                      {/* Sem chave (e a pessoa já entrou): pedir, uma vez por split (spec 06). */}
                      {pix &&
                        self &&
                        !split.members[o]?.pix &&
                        !!split.members[o]?.uid &&
                        (split.pixAsks?.[o]?.[me.id] || asked.has(o) ? (
                          <Button size="sm" variant="secondary" icon={<Icon name="pix" size="sm" />} disabled>
                            {t('pix.asked')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" icon={<Icon name="pix" size="sm" />} onClick={() => askPix(o)}>
                            {t('pix.ask')}
                          </Button>
                        ))}
                      <Button size="sm" icon={<Icon name="check" size="sm" />} onClick={() => flow.settle(viewer, o, c.amount)}>
                        {t('pay.markPaid')}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" icon={<Icon name="check" size="sm" />} onClick={() => flow.settle(o, viewer, c.amount)}>
                      {t('pay.gotIt')}
                    </Button>
                  )}
                </div>
              )}
              {isOpen &&
                toCheck.map((p) => (
                  <div key={p.id} className="pcpend">
                    <span className="cap">{t('my.pendPay', { name: nameOf(p.from), amount: fmt(p.amount) })}</span>
                    <span className="actgrp">
                      {small(t('pay.notRecv'), () => flow.disputePayment(p), 'ghost')}
                      {small(t('pay.confirmShort'), () => flow.confirmPayment(p), 'primary')}
                    </span>
                  </div>
                ))}
              {opened && (
                <div className="pcbody">
                  {c.entries.map((x) => entry(c, x))}
                  {c.entries.length === 0 && <p className="cap pcempty">{t('my.noEntries')}</p>}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
