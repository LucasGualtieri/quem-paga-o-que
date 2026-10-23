import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Icon, type Tone } from '../components/index.ts';
import { myView, type ShareState } from '../data/balance.ts';
import type { ExpenseDoc, Member, PaymentDoc, SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, dayMonth } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { useWhen } from './BalanceTab.tsx';
import { EmptyArt, TagIcon } from './common.tsx';
import type { usePayFlow } from './PaySheet.tsx';

type Flow = ReturnType<typeof usePayFlow>['flow'];

interface RowProps {
  tags: readonly string[];
  name: string;
  sub: string;
  amount: string;
  amountTone: Tone;
  badge: { tone: Tone; icon: 'clock' | 'check'; text: string };
  actions?: ReactNode;
}

function Row({ tags, name, sub, amount, amountTone, badge, actions }: RowProps) {
  return (
    <div className="row2">
      <div className="top">
        <TagIcon tags={tags} />
        <span className="mid">
          <span className="ttl">{name}</span>
          <span className="cap trunc">{sub}</span>
        </span>
        <span className={`amt strong ${amountTone}`} style={{ fontSize: 15.5 }}>
          {amount}
        </span>
      </div>
      <div className="acts split">
        <Badge tone={badge.tone} icon={badge.icon}>
          {badge.text}
        </Badge>
        <span className="actgrp">{actions}</span>
      </div>
    </div>
  );
}

/** Aba Minha visão: Devo / Já paguei / A receber; cada linha fica no lugar e troca o selo (spec 06). */
export function MyViewTab({ split, me, expenses, payments, flow }: { split: SplitDoc; me: Member; expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[]; flow: Flow }) {
  const { t } = useTranslation();
  const lang = useLang();
  const when = useWhen();
  const fmt = (c: number) => formatCents(c, lang);
  const isOpen = split.status === 'open';
  const nameOf = (id: string) => split.members[id]?.name ?? '?';
  const day = (e: ExpenseDoc) => dayMonth(dateOf(e.date), lang);

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

  const v = myView(split, expenses, payments, me.id);
  const badge = (s: ShareState, recv = false): RowProps['badge'] =>
    s === 'pend'
      ? { tone: recv ? 'pos' : 'neg', icon: 'clock', text: recv ? t('my.bRecv') : t('my.bPend') }
      : s === 'via'
        ? { tone: 'zero', icon: 'check', text: t('my.bVia') }
        : { tone: 'zero', icon: 'check', text: recv ? t('my.bRecvd') : t('my.bPaid') };

  const sendProof = (onClick: () => void) => (
    <Button size="sm" variant="ghost" icon={<Icon name="camera" size="sm" />} onClick={onClick}>
      {t('pay.sendProof')}
    </Button>
  );
  const act = (label: string, primary: boolean, onClick: () => void) => (
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={onClick}>
      {label}
    </Button>
  );

  const pendingOwe = v.owe.filter((i) => i.kind === 'share' && i.state === 'pend').length;
  const sections = [
    {
      key: 'owe',
      title: t('my.oweT'),
      count: pendingOwe ? t('my.pending', { count: pendingOwe }) : v.owe.length ? t('my.allPaid') : '',
      rows: v.owe.map((i) => {
        if (i.kind === 'payment') {
          const p: PaymentDoc = i.payment;
          return (
            <Row
              key={`p-${p.id}`}
              tags={['other']}
              name={t('my.settle')}
              sub={t('my.settleTo', { name: nameOf(p.to), when: when(p.when) })}
              amount={formatCents(-p.amount, lang, { signed: true })}
              amountTone="zero"
              badge={badge('paid')}
              actions={
                isOpen && (
                  <>
                    {!p.proof && sendProof(() => flow.attachPayment(p))}
                    {act(t('common.undo'), false, () => flow.undoPayment(p))}
                  </>
                )
              }
            />
          );
        }
        const e = i.expense;
        return (
          <Row
            key={`o-${e.id}`}
            tags={e.tags}
            name={e.name}
            sub={t('my.to', { name: nameOf(e.payer), date: day(e) })}
            amount={formatCents(-(i.state === 'pend' ? i.due : i.share), lang, { signed: true })}
            amountTone={i.state === 'pend' ? 'neg' : 'zero'}
            badge={badge(i.state)}
            actions={
              isOpen &&
              i.state !== 'via' &&
              (i.state === 'paid' ? (
                <>
                  {!e.proof[me.id] && sendProof(() => flow.attachShare(e, me.id))}
                  {act(t('common.undo'), false, () => flow.unmark(e, me.id))}
                </>
              ) : (
                act(t('pay.markPaid'), true, () => flow.markShare(e, me.id))
              ))
            }
          />
        );
      }),
    },
    {
      key: 'recv',
      title: t('my.recvT'),
      count: v.recv.length ? String(v.recv.length) : '',
      rows: v.recv.map((i) => (
        <Row
          key={`r-${i.expense.id}-${i.memberId}`}
          tags={i.expense.tags}
          name={i.expense.name}
          sub={t('my.from', { name: nameOf(i.memberId), date: day(i.expense) })}
          amount={formatCents(i.state === 'pend' ? i.due : i.share, lang, { signed: true })}
          amountTone={i.state === 'pend' ? 'pos' : 'zero'}
          badge={badge(i.state, true)}
          actions={
            isOpen &&
            i.state !== 'via' &&
            (i.state === 'paid' ? (
              <>
                {!i.expense.proof[i.memberId] && sendProof(() => flow.attachShare(i.expense, i.memberId))}
                {act(t('common.undo'), false, () => flow.unmark(i.expense, i.memberId))}
              </>
            ) : (
              act(t('pay.gotIt'), false, () => flow.markShare(i.expense, i.memberId))
            ))
          }
        />
      )),
    },
  ];

  return (
    <div className="content with-tabs" style={{ gap: 18 }}>
      <div className="stats3">
        <div className="stat">
          <span className="lbl">
            <Icon name="out" size="sm" className="neg" />
            {t('my.iOwe')}
          </span>
          <span className="v neg amt">{fmt(v.totals.owe)}</span>
        </div>
        <div className="stat">
          <span className="lbl">
            <Icon name="check" size="sm" className="zero" />
            {t('my.iPaid')}
          </span>
          <span className="v zero amt">{fmt(v.totals.paid)}</span>
        </div>
        <div className="stat">
          <span className="lbl">
            <Icon name="in" size="sm" className="pos" />
            {t('my.toRecv')}
          </span>
          <span className="v pos amt">{fmt(v.totals.recv)}</span>
        </div>
      </div>
      {sections.map((s) => (
        <section key={s.key}>
          <div className="sec-h">
            <h2 className="h4">{s.title}</h2>
            <span className="cap amt">{s.count}</span>
          </div>
          {s.rows.length === 0 ? (
            <p className="cap" style={{ padding: '0 4px' }}>
              {t('my.nothing')}
            </p>
          ) : (
            <div className="list">{s.rows}</div>
          )}
        </section>
      ))}
    </div>
  );
}
