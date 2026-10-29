import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Badge, Button, Icon, Sheet, SkeletonCard } from '../components/index.ts';
import { useHistory, useMoney, useSplit, type HistoryEntry } from '../data/hooks.ts';
import { canSeeProof, currencyOf, itemsBreakdown, myMember, payModeOf, sharesOf, type ExpenseDoc, type ItemPart, type Member, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { coveredExpenses, settlementOf, touchesSettled } from '../data/settlements.ts';
import { markRead, useNotifications } from '../data/notifications.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, shortDay, shortDayTime } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { BackLink, useWho } from './common.tsx';
import { EntryIconView } from './EntryIcon.tsx';
import { PhotoBox, usePayFlow } from './PaySheet.tsx';
import { hasPayments, useExpenseActions } from './useExpenseActions.ts';
import { CurrencyProvider } from '../lib/currency.ts';
import { MemberAvatar } from './Photos.tsx';

function useWhen() {
  const lang = useLang();
  return (d: Date | null) => (d ? shortDayTime(d, lang) : '');
}

function Body({ split, me, doc, expenses, payments }: { split: SplitDoc; me: Member; doc: ExpenseDoc; expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const who = useWho(split, me);
  const when = useWhen();
  const actions = useExpenseActions(split, me);
  const history = useHistory(split.id, doc.id);
  const [confirm, setConfirm] = useState(false);
  const { flow, sheets } = usePayFlow(split, me, who);
  // Destaque vem do caminho (?n= da notificação), pendência vem do estado (spec 07).
  const [params] = useSearchParams();
  const session = useSession();
  const notes = useNotifications(session.status === 'ready' ? session.uid : null);
  const note = notes?.find((n) => n.id === params.get('n') && n.expId === doc.id) ?? null;
  const hl = note?.memberId ?? null;
  const banner = note?.kind === 'paid' && note.memberId ? note : null;
  // O que a pessoa fez pelo banner aparece na hora, antes de o servidor atualizar o aviso.
  const [acted, setActed] = useState<'confirmed' | 'disputed' | null>(null);
  // Chegar pela notificação (lista ou, no futuro, e-mail) conta como abrir o aviso.
  useEffect(() => {
    if (note && !note.read) void markRead(note.id);
  }, [note]);
  const fmt = (c: number) => formatCents(c, lang, { currency: currencyOf(split) });
  const isOpen = split.status === 'open';

  const sh = sharesOf(doc, split);
  const rows = Object.entries(sh)
    .filter(([id, v]) => v > 0 || id === doc.payer)
    .sort(([a], [b]) => (split.members[a]?.joinOrder ?? 0) - (split.members[b]?.joinOrder ?? 0));
  const pendingCount = rows.filter(([id, v]) => id !== doc.payer && (doc.paid[id] ?? 0) < v).length;
  const canEdit = split.status === 'open' && (doc.author === me.id || me.admin);
  const authorName = split.members[doc.author]?.name ?? '';
  // Simplificado: paga-se só no Meu saldo; aqui ficam só os valores (spec 06).
  const simple = payModeOf(split) === 'simple';
  // Detalhado: com parte paga não exclui (decisão 7). Simplificado: exclui, mas avisa se o par já acertou.
  const blocked = !simple && hasPayments(doc);
  const warnSettled = simple && touchesSettled(doc, split, payments);

  const weights = Object.values(doc.w ?? {});
  const modeChip =
    doc.mode === 'equal'
      ? t('expense.detail.modeEqual', { count: doc.members.length })
      : doc.mode === 'frac'
        ? t('expense.detail.modeFrac', { w: weights.reduce((s, n) => s + n, 0) })
        : doc.mode === 'pct'
          ? t('expense.detail.modePct')
          : doc.mode === 'exact'
            ? t('expense.detail.modeExact')
            : t('expense.detail.modeItems');

  const caption = (id: string): string => (doc.mode === 'pct' ? `${doc.w?.[id] ?? 0}%` : doc.mode === 'frac' ? `${doc.w?.[id] ?? 0}/${weights.reduce((s, n) => s + n, 0)}` : '');
  const dateText = shortDay(dateOf(doc.date), lang);

  // Por itens: como cada item e o resto da compra foram divididos (o mesmo que a tela de lançar mostra).
  const breakdown = doc.mode === 'items' ? itemsBreakdown(doc, split) : null;
  const partText = (p: ItemPart): string => {
    const mode =
      p.mode === 'equal'
        ? t('expense.detail.modeEqual', { count: p.parts.length })
        : p.mode === 'frac'
          ? t('expense.detail.modeFrac', { w: p.parts.reduce((sum, x) => sum + (p.w?.[x.id] ?? 0), 0) })
          : p.mode === 'pct'
            ? t('expense.detail.modePct')
            : t('expense.detail.modeExact');
    const same = p.parts.every((x) => x.cents === p.parts[0]?.cents);
    // Espaço que não quebra: "Beatriz R$ 10,00" nunca se parte no meio.
    const money = (c: number) => fmt(c).replace(' ', '\u00a0');
    const who_ = p.parts.map((x) => who(x.id));
    const each =
      p.mode === 'equal' && same && p.parts.length > 0
        ? t('expense.detail.eachFor', { amount: money(p.parts[0]!.cents), names: new Intl.ListFormat(lang === 'en' ? 'en' : 'pt-BR', { type: 'conjunction' }).format(who_) })
        : p.parts.map((x) => `${who(x.id)}\u00a0${money(x.cents)}`).join(' · ');
    return `${mode} · ${each}`;
  };

  const historyText = (h: HistoryEntry): string => {
    const name = split.members[h.by]?.name ?? '';
    const whoName = split.members[h.memberId ?? '']?.name ?? '';
    if (h.kind === 'paid') return h.by === h.memberId ? t('expense.detail.hPaid', { name }) : t('expense.detail.hPaidFor', { name, who: whoName });
    if (h.kind === 'received') return t('expense.detail.hReceived', { name, who: whoName });
    if (h.kind === 'unpaid') return t('expense.detail.hUnpaid', { name, who: whoName });
    if (h.kind === 'confirmed') return t('expense.detail.hConfirmed', { name, who: whoName });
    if (h.kind === 'disputed') return t('expense.detail.hDisputed', { name, who: whoName });
    if (h.kind === 'proof') return t('expense.detail.hProof', { name });
    if (h.kind === 'settled') return t('expense.detail.hSettled', { name, who: whoName });
    if (h.kind === 'created') return t('expense.detail.hCreated', { name, amount: fmt(h.to ?? doc.amount) });
    if (h.kind === 'edited') return h.from !== undefined && h.to !== undefined ? t('expense.detail.hEditedAmount', { name, from: fmt(h.from), to: fmt(h.to) }) : t('expense.detail.hEdited', { name });
    if (h.kind === 'deleted') return t('expense.detail.hDeleted', { name });
    return t('expense.detail.hRestored', { name });
  };

  const page = (
    <main className="page">
      <header className="hdr">
        <BackLink to={`/s/${split.id}`} label={t('common.back')} />
        <span className="hdr-mid cap trunc">{split.name}</span>
        {canEdit && (
          <>
            <Link to={`/s/${split.id}/despesa/${doc.id}/editar`} className="iconbtn" aria-label={t('expense.detail.edit')}>
              <Icon name="pencil" />
            </Link>
            <button type="button" className="iconbtn" aria-label={t('expense.detail.del')} onClick={() => setConfirm(true)}>
              <Icon name="trash" />
            </button>
          </>
        )}
      </header>

      <div className="content" style={{ gap: 18, paddingBottom: 40 }}>
        {banner && (() => {
          const m = banner.memberId!;
          const member = split.members[m];
          const v = sh[m] ?? banner.amount;
          const paidNow = (doc.paid[m] ?? 0) > 0;
          const proof = paidNow ? doc.proof[m] : undefined;
          const pending = paidNow && !!doc.pendConf[m];
          const result = pending ? null : (acted ?? (banner.status === 'new' ? null : banner.status));
          return (
            <div className="nbanner" role="status">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="avsel">
                  <MemberAvatar member={member} name={member?.name ?? banner.fromName} />
                  <span className="nbadge" aria-hidden="true">
                    <Icon name="in" />
                  </span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="h4">{t('notif.bannerTitle', { name: member?.name ?? banner.fromName, amount: fmt(v) })}</p>
                  <p className="cap" style={{ marginTop: 2 }}>
                    {banner.at ? `${when(banner.at)} · ` : ''}
                    {proof?.path ? t('notif.sentProof') : t('notif.noProof')}
                  </p>
                </div>
              </div>
              <div className="nb-acts">
                {proof?.path && canSeeProof(split, me, m, doc.payer) && (
                  <Button size="sm" variant="secondary" icon={<Icon name="camera" size="sm" />} onClick={() => flow.viewProof({ proof, from: m, to: doc.payer, amount: v, what: doc.name })}>
                    {t('pay.seeProof')}
                  </Button>
                )}
                {pending && isOpen && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        setActed('confirmed');
                        flow.confirm(doc, m);
                      }}
                    >
                      {t('pay.confirmRecv')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setActed('disputed');
                        flow.dispute(doc, m);
                      }}
                    >
                      {t('pay.notRecv')}
                    </Button>
                  </>
                )}
                {result && (
                  <Badge tone={result === 'disputed' ? 'neg' : 'pos'} icon="check">
                    {result === 'disputed' ? t('notif.youSaidNo') : t('notif.youConfirmed')}
                  </Badge>
                )}
              </div>
            </div>
          );
        })()}

        <div className="detail-head">
          <EntryIconView icon={doc.icon} fallback={doc} size="lg" />
          <h1 className="h2" style={{ marginTop: 4 }}>
            {doc.name}
          </h1>
          <p className="big-amount amt">{fmt(doc.amount)}</p>
          <p className="cap">{t('expense.detail.paidLine', { name: who(doc.payer), date: dateText })}</p>
          <div className="chiprow wrap" style={{ gap: 6, marginTop: 2 }}>
            <Badge tone="acc">{modeChip}</Badge>
            {doc.tags.map((k) => (
              <Badge key={k} tone="zero">
                {t(`expense.tags.${k}`)}
              </Badge>
            ))}
          </div>
        </div>

        <section>
          <div className="sec-h">
            <h2 className="h4">{t('expense.detail.shareOf')}</h2>
            {!simple && <span className="cap amt">{pendingCount > 0 ? t('expense.detail.pending', { count: pendingCount }) : t('my.allPaid')}</span>}
          </div>
          <div className="list">
            {rows.map(([id, v]) => {
              const m = split.members[id];
              const isPayer = id === doc.payer;
              const paid = !isPayer && (doc.paid[id] ?? 0) >= v;
              const proof = doc.proof[id];
              // Parte paga num acerto do Meu saldo (modo detalhado): "Paga" ou "Compensada no acerto".
              const settlement = paid ? settlementOf(doc, id, payments) : null;
              // Pendência vem do estado (pendConf), não do caminho de entrada (spec 07).
              const toCheck = paid && !!doc.pendConf[id] && doc.payer === me.id;
              const canAct = !simple && !isPayer && isOpen && (me.admin || id === me.id || doc.payer === me.id);
              const canAttach = !simple && !settlement && paid && !proof && isOpen && (id === me.id || doc.payer === me.id || me.admin);
              const canView = paid && !!proof?.path && canSeeProof(split, me, id, doc.payer);
              const expired = paid && !!proof && !proof.path;
              // Com o banner aberto, Confirmar / Não recebi saem da linha (sem ações repetidas).
              const lineCheck = toCheck && isOpen && banner?.memberId !== id;
              const showActs = !simple && ((canAct && !toCheck) || canAttach || canView || expired || lineCheck);
              // No acerto, Confirmar / Não recebi / Desfazer valem para o acerto inteiro.
              const undo = () => (settlement ? flow.undoSettlement(settlement, coveredExpenses(settlement, expenses)) : flow.unmark(doc, id));
              const confirmLine = () => (settlement ? flow.confirmPayment(settlement) : flow.confirm(doc, id));
              const disputeLine = () => (settlement ? flow.disputePayment(settlement) : flow.dispute(doc, id));
              return (
                <div key={id} className={`row2 ${id === me.id ? 'me-row' : ''} ${hl === id ? 'hlrow' : ''}`}>
                  <div className="top">
                    <MemberAvatar member={m} size="lg" />
                    <span className="mid">
                      <span className="ttl">{who(id)}</span>
                      <span className="cap amt">{caption(id)}</span>
                    </span>
                    <span className="right">
                      <span className="amt strong">{fmt(v)}</span>
                      {isPayer ? (
                        <Badge tone="acc" icon="check">
                          {t('expense.detail.paidAcc')}
                        </Badge>
                      ) : simple ? null : toCheck ? (
                        <Badge tone="acc" icon="clock">
                          {settlement ? t('expense.detail.paidSettleConfirm') : t('expense.detail.paidConfirm')}
                        </Badge>
                      ) : settlement ? (
                        <Badge tone="zero" icon="check">
                          {settlement.from === id ? t('expense.detail.paidSettle') : t('expense.detail.offsetSettle')}
                        </Badge>
                      ) : paid ? (
                        <Badge tone="zero" icon="check">
                          {proof?.path ? t('expense.detail.paidProof') : t('expense.detail.paid')}
                        </Badge>
                      ) : (
                        <Badge tone="neg" icon="clock">
                          {t('expense.detail.pend')}
                        </Badge>
                      )}
                    </span>
                  </div>
                  {showActs && (
                    <div className="acts end">
                      {expired && <span className="cap">{t('pay.proofExpired')}</span>}
                      {canView && proof && (
                        <button type="button" className="linkbtn" onClick={() => flow.viewProof({ proof, from: id, to: doc.payer, amount: v, what: doc.name })}>
                          <Icon name="camera" size="sm" />
                          {t('pay.seeProof')}
                        </button>
                      )}
                      {canAttach && (
                        <Button size="sm" variant="ghost" icon={<Icon name="camera" size="sm" />} onClick={() => flow.attachShare(doc, id)}>
                          {t('pay.sendProof')}
                        </Button>
                      )}
                      {canAct && !toCheck && (
                        <Button size="sm" variant={!paid && id === me.id ? 'primary' : 'secondary'} onClick={() => (paid ? undo() : flow.markShare(doc, id))}>
                          {paid ? t('common.undo') : doc.payer === me.id ? t('pay.markRecv') : t('pay.markPaid')}
                        </Button>
                      )}
                      {lineCheck && (
                        <>
                          <Button size="sm" variant="secondary" onClick={disputeLine}>
                            {t('pay.notRecv')}
                          </Button>
                          <Button size="sm" onClick={confirmLine}>
                            {t('pay.confirmShort')}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {doc.mode === 'items' && (doc.items?.length ?? 0) > 0 && (
          <section>
            <div className="sec-h">
              <h2 className="h4">{t('expense.detail.itemsT')}</h2>
              <span className="cap amt">{doc.items?.length}</span>
            </div>
            <div className="list">
              {doc.items?.map((it, i) => (
                <div key={i} className="row" style={{ minHeight: 58 }}>
                  <EntryIconView icon={it.icon} fallback="item" size="sm" />
                  <span className="mid">
                    <span className="ttl">{it.name || t('expense.detail.itemNoName')}</span>
                    <span className="cap" style={{ whiteSpace: 'normal' }}>
                      {breakdown?.items[i] ? partText(breakdown.items[i]) : it.members.map((id) => who(id)).join(', ')}
                    </span>
                  </span>
                  <span className="amt strong">{fmt(it.amount)}</span>
                </div>
              ))}
              {breakdown?.rest && (
                <div className="row item-rest" style={{ minHeight: 58 }}>
                  <EntryIconView icon={{ kind: 'icon', name: 'cart' }} fallback="item" size="sm" />
                  <span className="mid">
                    <span className="ttl">{t('expense.form.restTitle')}</span>
                    <span className="cap" style={{ whiteSpace: 'normal' }}>
                      {t('expense.detail.restWhat')} · {partText(breakdown.rest)}
                    </span>
                  </span>
                  <span className="amt strong">{fmt(breakdown.rest.amount)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="sec-h">
            <h2 className="h4">{t('expense.detail.receipt')}</h2>
          </div>
          {doc.receipt?.path ? (
            <PhotoBox path={doc.receipt.path} alt={t('photo.receiptAlt')} />
          ) : (
            <p className="cap" style={{ padding: '0 4px' }}>
              {doc.receipt ? t('expense.detail.receiptExpired') : t('expense.detail.noReceipt')}
            </p>
          )}
        </section>

        {doc.longDesc && (
          <section>
            <div className="sec-h">
              <h2 className="h4">{t('expense.detail.longDesc')}</h2>
            </div>
            <p style={{ margin: '0 4px' }}>{doc.longDesc}</p>
          </section>
        )}
        {doc.note && (
          <section>
            <div className="sec-h">
              <h2 className="h4">{t('expense.detail.note')}</h2>
            </div>
            <p style={{ margin: '0 4px' }}>{doc.note}</p>
          </section>
        )}

        <section>
          <div className="sec-h">
            <h2 className="h4">{t('expense.detail.history')}</h2>
          </div>
          <div style={{ padding: '0 4px' }}>
            {history.map((h) => (
              <div key={h.id} className="ev">
                <span className="dl" aria-hidden="true" />
                <div>
                  <p style={{ fontWeight: 700 }}>{historyText(h)}</p>
                  <p className="cap">{when(h.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {canEdit ? (
          <div className="detail-acts">
            <Link to={`/s/${split.id}/despesa/${doc.id}/editar`} className="btn btn-s">
              <Icon name="pencil" />
              {t('expense.detail.edit')}
            </Link>
            <Button variant="danger" icon={<Icon name="trash" />} onClick={() => setConfirm(true)}>
              {t('expense.detail.del')}
            </Button>
          </div>
        ) : (
          <div className="info">
            <Icon name="lock" />
            <span>{isOpen ? t('expense.detail.lock', { name: authorName }) : t('fin.lock')}</span>
          </div>
        )}
      </div>

      <Sheet open={confirm} title={t('expense.detail.delT', { name: doc.name })} onClose={() => setConfirm(false)}>
        {blocked ? (
          <div className="alert" role="alert">
            <Icon name="alert" size="sm" />
            <span>{t('expense.detail.blocked')}</span>
          </div>
        ) : (
          <>
            <p className="muted">{t('expense.detail.delB')}</p>
            {warnSettled && (
              <div className="info">
                <Icon name="alert" />
                <span>{t('expense.changesSettled')}</span>
              </div>
            )}
          </>
        )}
        <div className="sheet-acts">
          {!blocked && (
            <Button
              block
              className="btn-danger-solid"
              onClick={() => {
                setConfirm(false);
                actions.remove(doc);
                void navigate(`/s/${split.id}`, { replace: true });
              }}
            >
              {t('expense.detail.del')}
            </Button>
          )}
          <Button variant="ghost" block onClick={() => setConfirm(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
      {sheets}
    </main>
  );
  return <CurrencyProvider value={currencyOf(split)}>{page}</CurrencyProvider>;
}

/** Detalhe da despesa (/s/:id/despesa/:expId). */
export default function ExpenseDetail() {
  const { t } = useTranslation();
  const { id = '', expId = '' } = useParams();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const result = useSplit(id, uid);
  const split = result.status === 'ready' ? result.data : null;
  const { expenses, payments, loaded } = useMoney(id, !!split, split);

  if (result.status === 'denied') return <Navigate to="/" replace />;
  if (!split || !uid || !loaded) {
    return (
      <main className="page">
        <div className="content" aria-busy="true" aria-label={t('common.loading')}>
          <SkeletonCard />
        </div>
      </main>
    );
  }
  const me = myMember(split, uid);
  if (!me) return <Navigate to="/" replace />;
  const doc = expenses.find((e) => e.id === expId);
  if (!doc || doc.deletedAt) {
    return (
      <main className="page">
        <header className="hdr">
          <BackLink to={`/s/${id}`} label={t('common.back')} />
        </header>
        <div className="content">
          <p className="muted">{t('expense.detail.notFound')}</p>
          <Link to={`/s/${id}`} className="btn btn-p btn-block">
            {t('expense.detail.back')}
          </Link>
        </div>
      </main>
    );
  }
  return <Body split={split} me={me} doc={doc} expenses={expenses} payments={payments} />;
}
