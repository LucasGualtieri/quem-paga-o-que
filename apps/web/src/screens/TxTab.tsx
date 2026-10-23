import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { nameKey, TAGS } from '@qpq/shared';
import { Avatar, avatarColor, Button, Chip, Icon, SkeletonCard } from '../components/index.ts';
import { pendingChecks } from '../data/balance.ts';
import { membersInOrder, sharesOf, type ExpenseDoc, type Member, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { dayLabel, EmptyArt, TagIcon, todayStr, useWho } from './common.tsx';

interface Filters {
  people: string[];
  tags: string[];
}

/** Quem aparece na despesa: quem pagou e quem tem parte. */
function involved(e: ExpenseDoc, split: SplitDoc): Set<string> {
  const out = new Set([e.payer]);
  for (const [id, v] of Object.entries(sharesOf(e, split))) if (v > 0) out.add(id);
  return out;
}

function sortDesc(a: ExpenseDoc, b: ExpenseDoc): number {
  return b.date.localeCompare(a.date) || (b.createdAt?.getTime() ?? Infinity) - (a.createdAt?.getTime() ?? Infinity);
}

/** Aba Transações: busca, filtros Pessoas/Tags e despesas agrupadas por dia. */
export function TxTab({ split, me, expenses, loaded, canAdd, onAdd, lastAdded }: { split: SplitDoc; me: Member; expenses: ExpenseDoc[]; loaded: boolean; canAdd: boolean; onAdd: () => void; lastAdded: string | null }) {
  const { t } = useTranslation();
  const lang = useLang();
  const who = useWho(split, me);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>({ people: [], tags: [] });
  const [open, setOpen] = useState<'p' | 't' | null>(null);
  const fmt = (c: number, signed = false) => formatCents(c, lang, { signed });
  const today = todayStr();
  const people = membersInOrder(split);

  const infos = useMemo(() => new Map(expenses.map((e) => [e.id, involved(e, split)])), [expenses, split]);
  const tagName = (k: string) => t(`expense.tags.${k}`);

  const visible = useMemo(() => {
    const needle = nameKey(q);
    return expenses
      .filter((e) => {
        if (needle && !nameKey(e.name).includes(needle) && !e.tags.some((k) => nameKey(tagName(k)).includes(needle))) return false;
        if (filters.people.length && !filters.people.some((id) => infos.get(e.id)?.has(id))) return false;
        if (filters.tags.length && !filters.tags.some((k) => e.tags.includes(k))) return false;
        return true;
      })
      .sort(sortDesc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, q, filters, infos, lang]);

  const groups = useMemo(() => {
    const m = new Map<string, ExpenseDoc[]>();
    for (const e of visible) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [visible]);

  const anyFilter = filters.people.length + filters.tags.length > 0;
  const toggle = (key: keyof Filters, v: string) => setFilters((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));

  /** Sua parte e o que a pessoa ainda tem a receber, descontando o que já foi pago (decisão 2). */
  const mineOf = (e: ExpenseDoc): { text: string; tone: 'neg' | 'pos' } | null => {
    const sh = sharesOf(e, split);
    if (e.payer === me.id) {
      const recv = Object.entries(sh).reduce((s, [id, v]) => (id === me.id ? s : s + Math.max(0, v - (e.paid[id] ?? 0))), 0);
      return recv > 0 ? { text: t('expense.tx.recv', { amount: fmt(recv, true) }), tone: 'pos' } : null;
    }
    const owe = Math.max(0, (sh[me.id] ?? 0) - (e.paid[me.id] ?? 0));
    return owe > 0 ? { text: t('expense.tx.owe', { amount: fmt(-owe) }), tone: 'neg' } : null;
  };

  const modeNote = (e: ExpenseDoc) => (e.mode === 'frac' ? t('expense.tx.byFrac') : e.mode === 'pct' ? t('expense.tx.byPct') : e.mode === 'exact' ? t('expense.tx.byExact') : e.mode === 'items' ? t('expense.tx.byItems') : '');

  const noActive = loaded && expenses.length === 0;

  return (
    <div className="content with-tabs" style={{ paddingTop: 2 }}>
      <div>
        <div className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder={t('expense.tx.searchPh')} value={q} aria-label={t('expense.tx.search')} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filters" role="group" aria-label={t('expense.tx.filter')}>
          <Chip pressed={filters.people.length > 0 || open === 'p'} aria-expanded={open === 'p'} aria-haspopup="true" onClick={() => setOpen(open === 'p' ? null : 'p')}>
            <Icon name="people" size="sm" />
            {t('expense.tx.people')}
            {filters.people.length > 0 && <span className="cnt">{filters.people.length}</span>}
            <Icon name="down" size="sm" />
          </Chip>
          <Chip pressed={filters.tags.length > 0 || open === 't'} aria-expanded={open === 't'} aria-haspopup="true" onClick={() => setOpen(open === 't' ? null : 't')}>
            <Icon name="tag" size="sm" />
            {t('expense.tx.tags')}
            {filters.tags.length > 0 && <span className="cnt">{filters.tags.length}</span>}
            <Icon name="down" size="sm" />
          </Chip>
          {anyFilter && (
            <button type="button" className="linkbtn" onClick={() => setFilters({ people: [], tags: [] })}>
              {t('expense.tx.clear')}
            </button>
          )}

          {open === 'p' && (
            <div className="dd" role="group" aria-label={t('expense.tx.people')}>
              {people.map((p) => {
                const on = filters.people.includes(p.id);
                const count = expenses.filter((e) => infos.get(e.id)?.has(p.id)).length;
                return (
                  <button key={p.id} type="button" className={`ddi ${on ? 'on' : 'off'}`} aria-pressed={on} onClick={() => toggle('people', p.id)}>
                    <span className="avsel">
                      <Avatar name={p.name} color={avatarColor(p.joinOrder)} size="sm" />
                      <span className="avck" aria-hidden="true">
                        <Icon name="check" />
                      </span>
                    </span>
                    <span>{who(p.id)}</span>
                    <span className="cap amt">{count}</span>
                  </button>
                );
              })}
              <div className="ddfoot">
                <button type="button" className="linkbtn" onClick={() => setFilters((f) => ({ ...f, people: [] }))}>
                  {t('expense.tx.clear')}
                </button>
                <Button size="sm" onClick={() => setOpen(null)}>
                  {t('expense.tx.show', { count: visible.length })}
                </Button>
              </div>
            </div>
          )}
          {open === 't' && (
            <div className="dd" role="group" aria-label={t('expense.tx.tags')}>
              {TAGS.map((k) => {
                const on = filters.tags.includes(k);
                const count = expenses.filter((e) => e.tags.includes(k)).length;
                return (
                  <button key={k} type="button" className={`ddi ${on ? 'on' : 'off'}`} aria-pressed={on} onClick={() => toggle('tags', k)}>
                    <span className="tick" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                    <span>{tagName(k)}</span>
                    <span className="cap amt">{count}</span>
                  </button>
                );
              })}
              <div className="ddfoot">
                <button type="button" className="linkbtn" onClick={() => setFilters((f) => ({ ...f, tags: [] }))}>
                  {t('expense.tx.clear')}
                </button>
                <Button size="sm" onClick={() => setOpen(null)}>
                  {t('expense.tx.show', { count: visible.length })}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!loaded && (
        <div className="sk-stack" aria-busy="true" aria-label={t('common.loading')}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {noActive && (
        <div className="empty" style={{ paddingTop: 50 }}>
          {canAdd ? <EmptyArt plus={{ label: t('expense.tx.add'), onClick: onAdd }} /> : <EmptyArt />}
          <h2 className="h2">{t('expense.tx.emptyT')}</h2>
          {canAdd && <p className="muted">{t('expense.tx.emptyB')}</p>}
        </div>
      )}

      {loaded && !noActive && visible.length === 0 && (
        <div className="empty" style={{ paddingTop: 24 }}>
          <p className="muted">{t('expense.tx.noResults')}</p>
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              setQ('');
              setFilters({ people: [], tags: [] });
            }}
          >
            {t('expense.tx.clearFilters')}
          </button>
        </div>
      )}

      {groups.map(([date, items]) => (
        <section key={date}>
          <div className="dayhdr">
            <span>{dayLabel(date, today, lang, (k) => t(k))}</span>
            <span className="amt">{fmt(items.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
          <div className="list">
            {items.map((e) => {
              const mine = mineOf(e);
              const pend = e.payer === me.id ? pendingChecks(e) : 0;
              const note = modeNote(e);
              return (
                <Link key={e.id} to={`/s/${split.id}/despesa/${e.id}`} className={`row txrow ${lastAdded === e.id ? 'new' : ''}`}>
                  <TagIcon tags={e.tags} />
                  <span className="mid">
                    <span className="ttl">{e.name}</span>
                    <span className="cap trunc">
                      {t('expense.tx.paidBy', { name: who(e.payer) })}
                      {note ? ` · ${note}` : ''}
                    </span>
                  </span>
                  <span className="right">
                    <span className="amt strong" style={{ fontSize: 15.5 }}>
                      {fmt(e.amount)}
                    </span>
                    {mine && <span className={`mine amt ${mine.tone}`}>{mine.text}</span>}
                    {pend > 0 && (
                      <span className="pendtag">
                        <span className="pdot" aria-hidden="true" />
                        {t('expense.tx.pending', { count: pend })}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
