import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, avatarColor, Button, Icon } from '../components/index.ts';
import { balanceView, type CardLine, type PersonCard } from '../data/balance.ts';
import { useProfile } from '../data/hooks.ts';
import type { ExpenseDoc, Member, PaymentDoc, SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { shortDayTime } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { EmptyArt, useBalanceView, useWho } from './common.tsx';
import type { usePayFlow } from './PaySheet.tsx';

type Flow = ReturnType<typeof usePayFlow>['flow'];

/** "Resolvido · agora": hora do acerto (há menos de 1 minuto, "agora"). */
export function useWhen() {
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

/** Aba Saldo: seu saldo e um cartão por pessoa com as dívidas reais de cada par. */
export function BalanceTab({ split, me, expenses, payments, flow }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const who = useWho(split, me);
  const when = useWhen();
  const view = useBalanceView();
  const session = useSession();
  const profile = useProfile(session.status === 'ready' ? session.uid : null);
  const selfName = profile.status === 'ready' && !!profile.data.prefs.selfName;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const fmt = (c: number) => formatCents(c, lang);
  const isOpen = split.status === 'open';

  const v = balanceView(split, expenses, payments, me.id);
  const flash = useFlash(v.mine);
  const mine = view(v.mine);
  const nameOf = (id: string) => split.members[id]?.name ?? '?';
  const colorOf = (id: string) => avatarColor(split.members[id]?.joinOrder ?? 0);
  const cardOpen = (id: string) => open[id] ?? id === me.id;
  const allOpen = v.cards.every((c) => cardOpen(c.id));
  const nobodyOwes = v.cards.every((c) => c.owes === 0);

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

  const summary = (c: PersonCard): string => {
    const done = c.done ? t('sal.done', { count: c.done }) : '';
    if (c.owes + c.gets === 0) return done ? t('sal.allSquareDone', { done }) : t('sal.allSquareAll');
    const parts = [c.owes ? t('sal.owesTo', { count: c.owes }) : '', c.gets ? t('sal.getsFrom', { count: c.gets }) : ''].filter(Boolean);
    return [done, ...parts].filter(Boolean).join(' · ');
  };

  const lineText = (r: string, l: CardLine): string => {
    const self = r === me.id && !selfName;
    if (l.kind === 'done') {
      if (l.paidOut) return self ? t('sal.youPaidTo', { name: nameOf(l.other) }) : t('sal.paidTo', { name: nameOf(l.other) });
      return self ? t('sal.paidYou', { name: nameOf(l.other) }) : t('sal.gotFrom', { name: nameOf(l.other) });
    }
    if (l.kind === 'owe') return r === me.id ? (selfName ? t('sal.oweTo', { name: nameOf(l.to) }) : t('sal.youOweTo', { name: nameOf(l.to) })) : t('sal.oweTo', { name: who(l.to) });
    return r === me.id ? (selfName ? t('sal.getFrom', { name: nameOf(l.from) }) : t('sal.owesYou', { name: nameOf(l.from) })) : t('sal.getFrom', { name: who(l.from) });
  };

  const line = (c: PersonCard, l: CardLine, i: number) => {
    if (l.kind === 'done') {
      const p = l.payment;
      const mineToo = p.from === me.id || p.to === me.id;
      const proofNote = p.proof ? (p.proof.path ? t('sal.withProof') : t('sal.expired')) : '';
      const canAttach = isOpen && !p.proof && mineToo;
      const canView = !!p.proof?.path;
      return (
        <div key={`d-${p.id}`} className="pcline done">
          <span className="dir zero" aria-hidden="true">
            <Icon name="check" size="sm" />
          </span>
          <Avatar name={nameOf(l.other)} color={colorOf(l.other)} size="sm" />
          <span className="mid">
            <span className="ttl">{lineText(c.id, l)}</span>
            <span className="cap" style={{ whiteSpace: 'normal' }}>
              {t('sal.settledNote', { when: when(p.when) })}
              {proofNote}
            </span>
          </span>
          <span className="side">
            <span className="amt strong">{fmt(p.amount)}</span>
            <span className="sideacts">
              {(canAttach || canView) && (
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={canView ? t('pay.seeProof') : t('pay.sendProof')}
                  title={canView ? t('pay.seeProof') : t('pay.sendProof')}
                  onClick={() =>
                    canView && p.proof
                      ? flow.viewProof({
                          proof: p.proof,
                          from: p.from,
                          to: p.to,
                          amount: p.amount,
                          what: t('my.settle'),
                        })
                      : flow.attachPayment(p)
                  }
                >
                  <Icon name="camera" size="sm" />
                </button>
              )}
              {isOpen && (me.admin || mineToo) && (
                <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={() => flow.undoPayment(p)}>
                  {t('common.undo')}
                </button>
              )}
            </span>
          </span>
        </div>
      );
    }
    const owe = l.kind === 'owe';
    const canMark = isOpen && (l.from === me.id || l.to === me.id || me.admin);
    return (
      <div key={`${l.kind}-${l.other}-${i}`}>
        <div className="pcline">
          <span className={`dir ${owe ? 'neg' : 'pos'}`} aria-hidden="true">
            <Icon name={owe ? 'out' : 'in'} size="sm" />
          </span>
          <Avatar name={nameOf(l.other)} color={colorOf(l.other)} size="sm" />
          <span className="mid">
            <span className="ttl">{lineText(c.id, l)}</span>
          </span>
          <span className={`amt strong ${owe ? 'neg' : 'pos'}`}>{formatCents(owe ? -l.amount : l.amount, lang, { signed: true })}</span>
        </div>
        {canMark && (
          <div className="pcact">
            <Button size="sm" variant={l.from === me.id ? 'primary' : 'secondary'} icon={<Icon name="check" size="sm" />} onClick={() => flow.settle(l.from, l.to, l.amount)}>
              {l.to === me.id ? t('pay.gotIt') : t('pay.markPaid')}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="content with-tabs" style={{ gap: 18 }}>
      <div
        className="card"
        style={{
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        aria-live="polite"
      >
        <p className="cap" style={{ fontWeight: 700 }}>
          {t('sal.yourBal')}
        </p>
        <div className={`bigbal ${flash}`}>
          <span className={`balico ${mine.tone}`} aria-hidden="true">
            <Icon name={mine.icon} />
          </span>
          <span>
            <span className={`num amt ${mine.tone}`}>{v.mine === 0 ? fmt(0) : formatCents(v.mine, lang, { signed: true })}</span>
            <span className="balcap" style={{ display: 'block' }}>
              {v.mine > 0 ? t('sal.owed') : v.mine < 0 ? t('sal.owe') : t('sal.square')}
            </span>
          </span>
        </div>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="sec-h" style={{ paddingBottom: 0, alignItems: 'center' }}>
          <h2 className="h4">{t('sal.byPerson')}</h2>
          <button type="button" className="linkbtn" onClick={() => setOpen(Object.fromEntries(v.cards.map((c) => [c.id, !allOpen])))}>
            {allOpen ? t('sal.collapseAll') : t('sal.expandAll')}
          </button>
        </div>
        {nobodyOwes && (
          <div className="info">
            <Icon name="check" />
            <span>{t('sal.allSettled')}</span>
          </div>
        )}
        {v.cards.map((c) => {
          const b = view(c.net);
          const opened = cardOpen(c.id);
          return (
            <div key={c.id} className={`pcard ${c.id === me.id ? 'me' : ''}`}>
              <button type="button" className="pchead" aria-expanded={opened} onClick={() => setOpen((o) => ({ ...o, [c.id]: !opened }))}>
                <Avatar name={nameOf(c.id)} color={colorOf(c.id)} />
                <span className="mid">
                  <span className="ttl">{who(c.id)}</span>
                  <span className="cap">{summary(c)}</span>
                </span>
                <span className="right">
                  <span className={`amt strong ${b.tone}`}>{c.net === 0 ? t('balance.settled') : formatCents(c.net, lang, { signed: true })}</span>
                  <span className="balcap">{c.net > 0 ? t('sal.gets') : c.net < 0 ? t('sal.owes') : ''}</span>
                </span>
                <Icon name="down" size="sm" className={opened ? 'up' : ''} />
              </button>
              {opened && (
                <div className="pcbody">
                  {c.lines.map((l, i) => line(c, l, i))}
                  {c.lines.length === 0 && <p className="cap pcempty">{t('sal.noDebts')}</p>}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
