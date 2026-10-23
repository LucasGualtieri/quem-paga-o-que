import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Avatar, avatarColor, Badge, Button, Icon, Sheet, SkeletonCard } from '../components/index.ts';
import { useExpenses, useHistory, useSplit, type HistoryEntry } from '../data/hooks.ts';
import { myMember, sharesOf, type ExpenseDoc, type Member, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, shortDay, shortDayTime } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { BackLink, TagIcon, useWho } from './common.tsx';
import { hasPayments, useExpenseActions } from './useExpenseActions.ts';

function useWhen() {
  const lang = useLang();
  return (d: Date | null) => (d ? shortDayTime(d, lang) : '');
}

function Body({ split, me, doc }: { split: SplitDoc; me: Member; doc: ExpenseDoc }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const who = useWho(split, me);
  const when = useWhen();
  const actions = useExpenseActions(split, me);
  const history = useHistory(split.id, doc.id);
  const [confirm, setConfirm] = useState(false);
  const fmt = (c: number) => formatCents(c, lang);

  const sh = sharesOf(doc, split);
  const rows = Object.entries(sh)
    .filter(([id, v]) => v > 0 || id === doc.payer)
    .sort(([a], [b]) => (split.members[a]?.joinOrder ?? 0) - (split.members[b]?.joinOrder ?? 0));
  const pendingCount = rows.filter(([id, v]) => id !== doc.payer && (doc.paid[id] ?? 0) < v).length;
  const canEdit = split.status === 'open' && (doc.author === me.id || me.admin);
  const authorName = split.members[doc.author]?.name ?? '';
  const blocked = hasPayments(doc);

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

  const historyText = (h: HistoryEntry): string => {
    const name = split.members[h.by]?.name ?? '';
    if (h.kind === 'created') return t('expense.detail.hCreated', { name, amount: fmt(h.to ?? doc.amount) });
    if (h.kind === 'edited') return h.from !== undefined && h.to !== undefined ? t('expense.detail.hEditedAmount', { name, from: fmt(h.from), to: fmt(h.to) }) : t('expense.detail.hEdited', { name });
    if (h.kind === 'deleted') return t('expense.detail.hDeleted', { name });
    return t('expense.detail.hRestored', { name });
  };

  return (
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
        <div className="detail-head">
          <TagIcon tags={doc.tags} size="lg" />
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
            <span className="cap amt">{pendingCount > 0 ? t('expense.detail.pending', { count: pendingCount }) : ''}</span>
          </div>
          <div className="list">
            {rows.map(([id, v]) => {
              const m = split.members[id];
              const isPayer = id === doc.payer;
              const paid = (doc.paid[id] ?? 0) >= v;
              return (
                <div key={id} className={`row2 ${id === me.id ? 'me-row' : ''}`}>
                  <div className="top">
                    <Avatar name={m?.name ?? '?'} color={avatarColor(m?.joinOrder ?? 0)} size="lg" />
                    <span className="mid">
                      <span className="ttl">{who(id)}</span>
                      <span className="cap amt">{caption(id)}</span>
                    </span>
                    <span className="right">
                      <span className="amt strong">{fmt(v)}</span>
                      {isPayer ? (
                        <Badge tone="zero" icon="check">
                          {t('expense.detail.paidAcc')}
                        </Badge>
                      ) : paid ? (
                        <Badge tone="zero" icon="check">
                          {t('expense.detail.paid')}
                        </Badge>
                      ) : (
                        <Badge tone="neg" icon="clock">
                          {t('expense.detail.pend')}
                        </Badge>
                      )}
                    </span>
                  </div>
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
                  <span className="mid">
                    <span className="ttl">{it.name || t('expense.detail.itemNoName')}</span>
                    <span className="cap" style={{ whiteSpace: 'normal' }}>
                      {it.members.map((id) => who(id)).join(', ')}
                    </span>
                  </span>
                  <span className="amt strong">{fmt(it.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="sec-h">
            <h2 className="h4">{t('expense.detail.receipt')}</h2>
          </div>
          <p className="cap" style={{ padding: '0 4px' }}>
            {t('expense.detail.noReceipt')}
          </p>
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
            <span>{t('expense.detail.lock', { name: authorName })}</span>
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
          <p className="muted">{t('expense.detail.delB')}</p>
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
    </main>
  );
}

/** Detalhe da despesa (/s/:id/despesa/:expId). */
export default function ExpenseDetail() {
  const { t } = useTranslation();
  const { id = '', expId = '' } = useParams();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const result = useSplit(id, uid);
  const split = result.status === 'ready' ? result.data : null;
  const { expenses, loaded } = useExpenses(id, !!split);

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
  return <Body split={split} me={me} doc={doc} />;
}
