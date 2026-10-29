import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { nameKey, TAGS } from '@qpq/shared';
import { Button, Chip, Icon, SkeletonCard, useToast } from '../components/index.ts';
import { pendingChecks } from '../data/balance.ts';
import { currencyOf, dueSharesOf, membersInOrder, payModeOf, sharesOf, today as brasiliaToday, type ExpenseDoc, type Member, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { installmentDates } from '@qpq/calc';
import { useLang } from '../i18n/index.ts';
import { dateOf, dayMonthYear } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { dayLabel, EmptyArt, todayStr, useWho } from './common.tsx';
import { EntryIconView } from './EntryIcon.tsx';
import { MemberAvatar } from './Photos.tsx';
import { canEditExpense, DeleteSheet, RowMenuSheet, SWIPE_W, useRowActions, useRowGestures, useSwipeHint, type RowAction } from './TxActions.tsx';
import { useExpenseActions } from './useExpenseActions.ts';

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

/**
 * Aba Despesas: busca, filtros Pessoas/Tags e despesas agrupadas por dia. Cada despesa desliza
 * para a esquerda (celular) ou tem "⋯" (computador) com Duplicar, Editar e Excluir; segurar
 * entra na seleção, que exclui várias de uma vez.
 */
export function TxTab({
  split,
  me,
  expenses,
  payments,
  loaded,
  canAdd,
  onAdd,
  lastAdded,
  onSelecting,
}: {
  split: SplitDoc;
  me: Member;
  expenses: ExpenseDoc[];
  payments: readonly PaymentDoc[];
  loaded: boolean;
  canAdd: boolean;
  onAdd: () => void;
  lastAdded: string | null;
  onSelecting: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const actions = useExpenseActions(split, me);
  const rowActions = useRowActions(split, me);
  // Ações só com o split aberto (finalizado é só leitura).
  const live = split.status === 'open';
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [menu, setMenu] = useState<ExpenseDoc | null>(null);
  const [deleting, setDeleting] = useState<ExpenseDoc[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const hint = useSwipeHint(live && expenses.length > 0);
  const who = useWho(split, me);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>({ people: [], tags: [] });
  const [open, setOpen] = useState<'p' | 't' | null>(null);
  const fmt = (c: number, signed = false) => formatCents(c, lang, { signed, currency: currencyOf(split) });
  const today = todayStr();
  const day = useMemo(() => brasiliaToday(), []);
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

  const simple = payModeOf(split) === 'simple';

  /**
   * Sua parte e o que a pessoa ainda tem a receber, descontando o que já foi pago (decisão 2). No
   * modo simplificado não se paga por despesa: só a sua parte, em cinza, sem "a receber" (spec 06).
   */
  const mineOf = (e: ExpenseDoc): { text: string; tone: 'neg' | 'pos' | 'muted' } | null => {
    const sh = sharesOf(e, split);
    if (simple) {
      const part = sh[me.id] ?? 0;
      return part > 0 ? { text: t('expense.tx.owe', { amount: fmt(part) }), tone: 'muted' } : null;
    }
    // Detalhado: só o que já venceu se paga (parcelada, spec 05).
    const due = dueSharesOf(e, split);
    if (e.payer === me.id) {
      const recv = Object.entries(due).reduce((s, [id, v]) => (id === me.id ? s : s + Math.max(0, v - (e.paid[id] ?? 0))), 0);
      return recv > 0 ? { text: t('expense.tx.recv', { amount: fmt(recv, true) }), tone: 'pos' } : null;
    }
    const owe = Math.max(0, (due[me.id] ?? 0) - (e.paid[me.id] ?? 0));
    return owe > 0 ? { text: t('expense.tx.owe', { amount: fmt(-owe) }), tone: 'neg' } : null;
  };

  const modeNote = (e: ExpenseDoc) => (e.mode === 'frac' ? t('expense.tx.byFrac') : e.mode === 'pct' ? t('expense.tx.byPct') : e.mode === 'exact' ? t('expense.tx.byExact') : e.mode === 'items' ? t('expense.tx.byItems') : '');
  // Parcelada: em quantas vezes e qual parcela está em cobrança (pelas datas, sem contar antecipações).
  const planNote = (e: ExpenseDoc) => {
    const plan = e.installments;
    if (!plan) return '';
    const dates = installmentDates(plan);
    const k = dates.filter((d) => d <= day).length;
    const date = (i: number) => dayMonthYear(dateOf(dates[i]!), lang);
    // A parcela em cobrança é a primeira que ainda não venceu (spec 05).
    return k < plan.count ? t('expense.tx.planNext', { count: plan.count, n: k + 1, date: date(k) }) : t('expense.tx.planDone', { count: plan.count });
  };

  const noActive = loaded && expenses.length === 0;

  const selecting = selected !== null;
  useEffect(() => onSelecting(selecting), [selecting, onSelecting]);
  useEffect(() => () => onSelecting(false), [onSelecting]);
  // Despesa que sumiu (excluída por outra pessoa) sai da seleção.
  const chosen = selecting ? visible.filter((e) => selected.has(e.id)) : [];
  useEffect(() => {
    if (!selecting) return;
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && setSelected(null);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [selecting]);
  // Uma linha aberta fecha ao tocar fora dela.
  useEffect(() => {
    if (!swiped) return;
    const away = (ev: PointerEvent) => {
      if (!(ev.target as Element).closest?.(`[data-row="${swiped}"]`)) setSwiped(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [swiped]);

  const toggleSel = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur ?? []);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      // Zerar a seleção não sai do modo: só Cancelar (ou Esc).
      return next;
    });
  const startSelect = (e: ExpenseDoc) => {
    setSwiped(null);
    setSelected(new Set([e.id]));
  };

  const run = (e: ExpenseDoc, a: RowAction) => {
    setSwiped(null);
    setMenu(null);
    if (a.locked) {
      toast.show({ kind: 'error', text: a.locked });
      return;
    }
    if (a.key === 'duplicate') setCopied(actions.duplicate(e));
    else if (a.key === 'edit') void navigate(`/s/${split.id}/despesa/${e.id}/editar`);
    else if (a.key === 'delete') setDeleting([e]);
    else startSelect(e);
  };

  // Barra da seleção: total e sua parte; Excluir só se todas forem suas (ou você for admin).
  const selTotal = chosen.reduce((sum, e) => sum + e.amount, 0);
  const selMine = chosen.reduce((sum, e) => sum + (sharesOf(e, split)[me.id] ?? 0), 0);
  const notMine = chosen.filter((e) => !canEditExpense(e, split, me)).length;

  return (
    // Com o "+" na tela, folga no fim da lista para o último cartão nunca ficar atrás dele.
    <div className={`content with-tabs ${canAdd && expenses.length > 0 ? 'with-fab' : ''}`} style={{ paddingTop: 2 }}>
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
                      <MemberAvatar member={p} size="sm" />
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

      {hint.text && visible.length > 0 && (
        <p className="cap swipe-tip" role="note">
          {t('expense.tx.swipeHint')}
        </p>
      )}

      {/* Na seleção, acima dos dias: marca (ou desmarca) todas as que estão na tela, respeitando a busca e os filtros. */}
      {selecting && visible.length > 0 && (
        <button type="button" className="dayhdr daysel selall" aria-pressed={chosen.length === visible.length} onClick={() => toggleSel(visible.map((e) => e.id), chosen.length < visible.length)}>
          <span className="daysel-l">
            <span className={`tick ${chosen.length === visible.length ? 'on' : ''}`} aria-hidden="true">
              <Icon name="check" />
            </span>
            {t('expense.tx.selectAll', { count: visible.length })}
          </span>
          <span className="amt">{fmt(visible.reduce((s, e) => s + e.amount, 0))}</span>
        </button>
      )}

      {groups.map(([date, items]) => {
        const day = dayLabel(date, today, lang, (k) => t(k));
        const total = <span className="amt">{fmt(items.reduce((s, e) => s + e.amount, 0))}</span>;
        const allOn = selecting && items.every((e) => selected.has(e.id));
        return (
        <section key={date}>
          {selecting ? (
            // Na seleção, o cabeçalho do dia marca (ou desmarca) todas as despesas dele.
            <button type="button" className="dayhdr daysel" aria-pressed={allOn} onClick={() => toggleSel(items.map((e) => e.id), !allOn)}>
              <span className="daysel-l">
                <span className={`tick ${allOn ? 'on' : ''}`} aria-hidden="true">
                  <Icon name="check" />
                </span>
                {t('expense.tx.selectDay', { day })}
              </span>
              {total}
            </button>
          ) : (
            <div className="dayhdr">
              <span>{day}</span>
              {total}
            </div>
          )}
          <div className="list">
            {items.map((e) => {
              const mine = mineOf(e);
              const pend = e.payer === me.id && !simple ? pendingChecks(e) : 0;
              const note = modeNote(e);
              const plan = planNote(e);
              const isSel = selected?.has(e.id) ?? false;
              return (
                <TxRow
                  key={e.id}
                  id={e.id}
                  to={`/s/${split.id}/despesa/${e.id}`}
                  className={lastAdded === e.id || copied === e.id ? 'new' : ''}
                  peek={hint.peek && e.id === visible[0]?.id}
                  live={live}
                  selecting={selecting}
                  selected={isSel}
                  open={swiped === e.id}
                  actions={rowActions(e, true)}
                  onOpen={(o) => {
                    setSwiped(o ? e.id : null);
                    if (o) hint.used();
                  }}
                  onLong={() => (selecting ? toggleSel([e.id], !isSel) : startSelect(e))}
                  onToggle={() => toggleSel([e.id], !isSel)}
                  onAction={(a) => run(e, a)}
                  onMenu={() => setMenu(e)}
                  menuLabel={t('expense.tx.more', { name: e.name })}
                  icon={
                    <span className={`txsel ${isSel ? 'on' : ''}`}>
                      <EntryIconView icon={e.icon} fallback={e} />
                      {selecting && (
                        <span className="avck" aria-hidden="true">
                          <Icon name="check" />
                        </span>
                      )}
                    </span>
                  }
                >
                  <span className="mid">
                    <span className="ttl">{e.name}</span>
                    <span className="cap trunc">
                      {t('expense.tx.paidBy', { name: who(e.payer) })}
                      {note ? ` · ${note}` : ''}
                    </span>
                    {plan && <span className="cap plan-cap">{plan}</span>}
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
                </TxRow>
              );
            })}
          </div>
        </section>
        );
      })}

      {selecting && (
        <div className="selbar" role="region" aria-label={t('expense.tx.selection')}>
          <div className="selbar-info" aria-live="polite">
            <span className="ttl">{t('expense.tx.selected', { count: chosen.length })}</span>
            {chosen.length > 0 && (
              <span className="cap">
                {fmt(selTotal)} · {t('expense.tx.owe', { amount: fmt(selMine) })}
              </span>
            )}
            {notMine > 0 && <span className="cap selbar-lock">{t('expense.tx.lockSome', { count: notMine, total: chosen.length })}</span>}
          </div>
          <div className="selbar-acts">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" size="sm" icon={<Icon name="trash" size="sm" />} disabled={notMine > 0 || chosen.length === 0} onClick={() => setDeleting(chosen)}>
              {t('expense.detail.del')}
            </Button>
          </div>
        </div>
      )}

      {menu && <RowMenuSheet expense={menu} actions={rowActions(menu, true)} onPick={(a) => run(menu, a)} onClose={() => setMenu(null)} />}
      {deleting && (
        <DeleteSheet
          list={deleting}
          split={split}
          payments={payments}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            actions.removeMany(deleting);
            setDeleting(null);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Uma despesa da lista. No toque: desliza para mostrar as ações e segura para selecionar. No
 * computador: "⋯" sempre visível. Na seleção, tocar marca ou desmarca em vez de abrir.
 */
function TxRow(p: {
  id: string;
  to: string;
  className: string;
  peek: boolean;
  live: boolean;
  selecting: boolean;
  selected: boolean;
  open: boolean;
  actions: RowAction[];
  onOpen: (open: boolean) => void;
  onLong: () => void;
  onToggle: () => void;
  onAction: (a: RowAction) => void;
  onMenu: () => void;
  menuLabel: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const gest = useRowGestures({ open: p.open, enabled: p.live && !p.selecting, onOpen: p.onOpen, onLong: () => p.live && p.onLong() });
  const swipeActs = p.actions.filter((a) => a.key !== 'select');
  return (
    <div className={`swipe ${p.selecting ? 'selecting' : ''}`} data-row={p.id}>
      {/* As ações só existem atrás da linha enquanto ela está deslizada (ou espiando). */}
      {p.live && !p.selecting && (p.open || gest.dragging || gest.offset !== 0 || p.peek) && (
        <div className="swipe-acts" aria-hidden={!p.open} style={{ width: SWIPE_W }}>
          {swipeActs.map((a) => (
            <button key={a.key} type="button" tabIndex={p.open ? 0 : -1} className={`swipe-act ${a.key} ${a.locked ? 'locked' : ''}`} onClick={() => p.onAction(a)}>
              <Icon name={a.icon} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className={`swipe-front ${gest.dragging ? 'dragging' : ''} ${p.peek ? 'peek' : ''} ${p.className}`} style={{ transform: gest.offset ? `translateX(${gest.offset}px)` : undefined }}>
        <Link
          ref={gest.ref}
          to={p.to}
          className={`row txrow ${p.selected ? 'sel' : ''}`}
          aria-pressed={p.selecting ? p.selected : undefined}
          {...gest.handlers}
          onClick={(ev) => {
            if (gest.swallowClick()) return ev.preventDefault();
            if (p.open) {
              ev.preventDefault();
              p.onOpen(false);
            } else if (p.selecting) {
              ev.preventDefault();
              p.onToggle();
            }
          }}
        >
          {p.icon}
          {p.children}
        </Link>
        {p.live && !p.selecting && (
          <button type="button" className="iconbtn txmore" aria-label={p.menuLabel} onClick={p.onMenu}>
            <Icon name="dots" />
          </button>
        )}
      </div>
    </div>
  );
}
