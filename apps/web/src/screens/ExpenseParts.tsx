import type { ChangeEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Cents, ExpenseErrorCode, SplitMode } from '@qpq/calc';
import { AvatarToggle, avatarColor, Icon, Segmented, Stepper } from '../components/index.ts';
import { itemWithMode, type ItemForm, type WeightText } from '../data/expenseForm.ts';
import type { Member } from '../data/model.ts';
import { useLang, type Lang } from '../i18n/index.ts';
import { DEFAULT_CURRENCY, type Currency } from '@qpq/shared';
import { useCurrency } from '../lib/currency.ts';
import { currencySymbol, formatCents, parseCents } from '../lib/money.ts';
import { MemberAvatar } from './Photos.tsx';
import { amountInput } from './common.tsx';

export const SPLIT_MODES: SplitMode[] = ['equal', 'frac', 'pct', 'exact'];

/** Peso digitado → número (vazio ou inválido = 0). */
export function weightOf(s: string | undefined): number {
  const n = Number.parseFloat((s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

type T = (k: string, o?: Record<string, unknown>) => string;

/** Linha de situação da divisão: soma de %, ou quanto falta nos valores exatos. */
export function splitStatus(mode: SplitMode, ids: readonly string[], w: WeightText, total: Cents, lang: Lang, t: T, currency: Currency = DEFAULT_CURRENCY): { text: string; ok: boolean } | null {
  if (mode === 'pct') {
    const sum = Math.round(ids.reduce((s, id) => s + weightOf(w[id]), 0) * 100) / 100;
    const diff = Math.abs(Math.round((100 - sum) * 100) / 100);
    const base = t('expense.form.pctSum', { sum });
    return sum === 100 ? { text: `${base} · ${t('expense.form.allGood')}`, ok: true } : { text: `${base} · ${t(sum < 100 ? 'expense.form.pctLeft' : 'expense.form.pctOver', { diff })}`, ok: false };
  }
  if (mode === 'exact') {
    const sum = ids.reduce((s, id) => s + (parseCents(w[id] ?? '') ?? 0), 0);
    const base = t('expense.form.exactSum', { sum: formatCents(sum, lang, { currency }), total: formatCents(total, lang, { currency }) });
    return sum === total ? { text: `${base} · ${t('expense.form.allGood')}`, ok: true } : { text: `${base} · ${t(sum < total ? 'expense.form.exactLeft' : 'expense.form.exactOver', { diff: formatCents(Math.abs(total - sum), lang, { currency }) })}`, ok: false };
  }
  return null;
}

/** Mensagem de erro da divisão (a mesma para todos os modos que "não fecham"). */
export function splitErrorText(code: ExpenseErrorCode | null | undefined, t: T): string | null {
  if (!code) return null;
  if (code === 'no-members') return t('expense.form.selectSome');
  if (code === 'no-items') return t('expense.form.noItems');
  if (code === 'items-exceed-total') return t('expense.form.itemsExceed');
  if (code === 'amount-invalid' || code === 'unknown-member') return null;
  return t('expense.form.splitErr');
}

interface WeightRowsProps {
  mode: SplitMode;
  people: readonly Member[];
  w: WeightText;
  onChange: (id: string, value: string) => void;
  /** Texto de baixo do nome (a parte de cada um); só nas linhas grandes. */
  caption?: (id: string) => string;
  compact?: boolean;
  whoName: (id: string) => string;
}

/** Um controle por pessoa: stepper de pedaços, % ou valor exato (na moeda do split). */
export function WeightRows({ mode, people, w, onChange, caption, compact, whoName }: WeightRowsProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const currency = useCurrency();
  return (
    <>
      {people.map((p) => {
        const name = whoName(p.id);
        const control =
          mode === 'frac' ? (
            <div role="group" aria-label={name}>
              <Stepper value={weightOf(w[p.id])} min={0} onChange={(n) => onChange(p.id, String(n))} />
            </div>
          ) : (
            <div className="minibox">
              {mode === 'exact' && <span>{currencySymbol(currency, lang)}</span>}
              <input
                {...(mode === 'exact' ? amountInput(w[p.id] ?? '', lang, (v) => onChange(p.id, v)) : { inputMode: 'decimal' as const, value: w[p.id] ?? '', onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(p.id, e.target.value) })}
                aria-label={t('expense.form.weightAria', { name })}
                style={{ width: mode === 'pct' ? 48 : 62 }}
              />
              {mode === 'pct' && <span>%</span>}
            </div>
          );
        return compact ? (
          <div key={p.id} className="iwrow">
            <MemberAvatar member={p} size="sm" />
            <span className="mid">
              <span className="ttl" style={{ fontSize: 14 }}>
                {name}
              </span>
              {caption && <span className="cap amt">{caption(p.id)}</span>}
            </span>
            {control}
          </div>
        ) : (
          <div key={p.id} className="row">
            <MemberAvatar member={p} />
            <span className="mid">
              <span className="ttl">{name}</span>
              {caption && <span className="cap amt">{caption(p.id)}</span>}
            </span>
            {control}
          </div>
        );
      })}
    </>
  );
}

interface WhoProps {
  people: readonly Member[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  whoName: (id: string) => string;
  label: string;
  expanded: boolean;
  onExpand: () => void;
}

/** "Todos" + um avatar por pessoa; com mais de 5, rola na horizontal e tem "Ver todos (N)". */
export function WhoToggles({ people, selected, onChange, whoName, label, expanded, onExpand }: WhoProps) {
  const { t } = useTranslation();
  const set = new Set(selected);
  const all = people.length > 0 && people.every((p) => set.has(p.id));
  const toggle = (id: string) => onChange(people.filter((p) => (p.id === id ? !set.has(id) : set.has(p.id))).map((p) => p.id));
  return (
    <>
      <div className="iwho" role="group" aria-label={label}>
        <AvatarToggle all name={t('expense.form.all')} color={1} selected={all} onClick={() => onChange(all ? [] : people.map((p) => p.id))} />
        <span className="avsep" aria-hidden="true" />
        <div className={`avscroll ${expanded ? 'exp' : ''}`}>
          {people.map((p) => (
            <AvatarToggle key={p.id} name={whoName(p.id)} avatarName={p.name} color={avatarColor(p.joinOrder)} avatar={<MemberAvatar member={p} />} selected={set.has(p.id)} onClick={() => toggle(p.id)} />
          ))}
        </div>
      </div>
      {people.length > 5 && (
        <div className="iwfoot" style={{ minHeight: 0 }}>
          <span />
          <button type="button" className="linkbtn" aria-expanded={expanded} onClick={onExpand}>
            {expanded ? t('expense.form.seeLess') : t('expense.form.seeAll', { count: people.length })}
            <Icon name={expanded ? 'up' : 'down'} size="sm" />
          </button>
        </div>
      )}
    </>
  );
}

interface ModePickerProps {
  mode: SplitMode;
  onChange: (m: SplitMode) => void;
  label: string;
  className?: string;
  /** Rótulos curtos (Igual, Frações, %, Valor), como nos itens do protótipo. */
  short?: boolean;
}

export function ModePicker({ mode, onChange, label, className, short }: ModePickerProps) {
  const { t } = useTranslation();
  return <Segmented<SplitMode> label={label} className={className ?? ''} value={mode} onChange={onChange} options={SPLIT_MODES.map((m) => ({ value: m, label: t(short ? `expense.form.modesShort.${m}` : `modes.${m}`) }))} />;
}

export { itemWithMode };
export type { ItemForm };

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="errmsg" role="alert">
      <Icon name="alert" size="sm" />
      {children}
    </p>
  );
}
