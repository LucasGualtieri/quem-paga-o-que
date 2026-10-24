import {
  effectiveAmount,
  shares as calcShares,
  validateExpense,
  type Cents,
  type Expense,
  type ExpenseErrorCode,
  type ExpenseMode,
  type JoinOrder,
  type MemberId,
  type Shares,
  type SplitMode,
  type Weights,
} from '@qpq/calc';
import { type EntryIcon, normalizeTags, type ExpenseInput } from '@qpq/shared';
import { formatInputCents, parseCents } from '../lib/money.ts';
import type { Lang } from '../i18n/index.ts';
import type { ExpenseDoc, Member } from './model.ts';

/** Pesos como a pessoa digita: frações "2", % "33,33", valor exato em reais "10,50". */
export type WeightText = Record<MemberId, string>;

export interface ItemForm {
  key: string;
  name: string;
  amountStr: string;
  members: MemberId[];
  mode: SplitMode;
  w: WeightText;
  /** Minimizado numa linha de resumo; com erro, reabre sozinho. */
  min: boolean;
  /** Ícone ou emoji do item; ausente = ícone padrão de item. */
  icon?: EntryIcon;
}

export interface FormState {
  name: string;
  amountStr: string;
  payer: MemberId;
  members: MemberId[];
  mode: ExpenseMode;
  w: WeightText;
  items: ItemForm[];
  rest: MemberId[];
  restMode: SplitMode;
  restW: WeightText;
  date: string;
  tags: string[];
  note: string;
  longDesc: string;
  /** Ícone ou emoji da despesa; ausente = automático pela tag. */
  icon?: EntryIcon;
}

export function initialForm(people: readonly Member[], me: MemberId, today: string): FormState {
  return {
    name: '',
    amountStr: '',
    payer: me,
    members: people.map((p) => p.id),
    mode: 'equal',
    w: {},
    items: [],
    rest: [],
    restMode: 'equal',
    restW: {},
    date: today,
    tags: [],
    note: '',
    longDesc: '',
  };
}

export function newItem(key: string, members: MemberId[]): ItemForm {
  return { key, name: '', amountStr: '', members, mode: 'equal', w: {}, min: false };
}

const dec = (lang: Lang) => (lang === 'en' ? '.' : ',');

/** Peso digitado → número; vazio ou inválido conta como zero. */
function weightNumber(s: string): number {
  const n = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toWeights(mode: ExpenseMode | SplitMode, ids: readonly MemberId[], w: WeightText): Weights {
  const out: Record<MemberId, number> = {};
  for (const id of ids) out[id] = mode === 'exact' ? (parseCents(w[id] ?? '') ?? 0) : weightNumber(w[id] ?? '');
  return out;
}

/** Pesos iniciais de cada modo: frações 1, % igual entre todos (soma 100), valor exato = a parte igual. */
export function defaultWeights(mode: ExpenseMode | SplitMode, ids: readonly MemberId[], totalCents: Cents, lang: Lang): WeightText {
  const out: Record<MemberId, string> = {};
  const n = ids.length;
  if (n === 0) return out;
  if (mode === 'frac') for (const id of ids) out[id] = '1';
  if (mode === 'pct') {
    const base = Math.floor(10000 / n);
    const extra = 10000 - base * n;
    ids.forEach((id, i) => {
      const hundredths = base + (i < extra ? 1 : 0);
      out[id] = `${Math.floor(hundredths / 100)}${dec(lang)}${String(hundredths % 100).padStart(2, '0')}`;
    });
  }
  if (mode === 'exact') {
    const order = Object.fromEntries(ids.map((id, i) => [id, i]));
    const parts = calcShares({ amount: totalCents, members: ids, mode: 'equal' }, order);
    for (const id of ids) out[id] = formatInputCents(parts[id] ?? 0, lang);
  }
  return out;
}

export function setMode(f: FormState, mode: ExpenseMode, lang: Lang): FormState {
  const total = parseCents(f.amountStr) ?? 0;
  const next: FormState = { ...f, mode, w: defaultWeights(mode, f.members, total, lang) };
  if (mode === 'items' && f.items.length === 0) {
    next.items = [newItem('i1', f.members)];
    next.rest = f.members;
  }
  return next;
}

/** Marca ou desmarca quem divide; a lista fica na ordem de entrada. */
export function toggleMember(f: FormState, id: MemberId, people: readonly Member[]): FormState {
  const set = new Set(f.members);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const members = people.filter((p) => set.has(p.id)).map((p) => p.id);
  const w = { ...f.w };
  if (set.has(id) && w[id] === undefined) w[id] = f.mode === 'frac' ? '1' : '0';
  return { ...f, members, w };
}

export function itemWithMode(item: ItemForm, mode: SplitMode, lang: Lang): ItemForm {
  return { ...item, mode, w: defaultWeights(mode, item.members, parseCents(item.amountStr) ?? 0, lang) };
}

export function restWithMode(f: FormState, mode: SplitMode, lang: Lang): FormState {
  const total = parseCents(f.amountStr) ?? 0;
  const used = f.items.reduce((s, it) => s + (parseCents(it.amountStr) ?? 0), 0);
  return { ...f, restMode: mode, restW: defaultWeights(mode, f.rest, Math.max(0, total - used), lang) };
}

/** O formulário como despesa do motor de cálculo (para validar e pré-visualizar). */
function toExpense(f: FormState): Expense {
  const amount = f.amountStr.trim() === '' && f.mode === 'items' ? null : (parseCents(f.amountStr) ?? Number.NaN);
  const e: Expense = {
    amount: f.mode === 'items' ? amount : Number.isNaN(amount) ? null : amount,
    payer: f.payer,
    members: f.mode === 'items' ? itemPeople(f) : f.members,
    mode: f.mode,
  };
  if (f.mode === 'items') {
    e.items = f.items.map((it) => ({
      amount: parseCents(it.amountStr) ?? 0,
      members: it.members,
      mode: it.mode,
      ...(it.mode === 'equal' ? {} : { w: toWeights(it.mode, it.members, it.w) }),
    }));
    e.rest = f.rest;
    e.restMode = f.restMode;
    if (f.restMode !== 'equal') e.restW = toWeights(f.restMode, f.rest, f.restW);
  } else if (f.mode !== 'equal') {
    e.w = toWeights(f.mode, f.members, f.w);
  }
  return e;
}

/** Quem aparece na despesa por itens (itens e resto), na ordem em que entram. */
function itemPeople(f: FormState): MemberId[] {
  return [...new Set([...f.items.flatMap((it) => it.members), ...f.rest])];
}

export interface Analysis {
  ok: boolean;
  total: Cents;
  shares: Shares;
  nameError: boolean;
  amountError: boolean;
  splitError: ExpenseErrorCode | null;
  /** Erro por item (índice) e do resto (`rest`). */
  itemErrors: Partial<Record<string, ExpenseErrorCode>>;
  /** Total menos itens; negativo = itens passam do total. */
  rest: Cents;
  /** Soma das porcentagens digitadas (modo %). */
  pctSum: number;
  /** Soma dos valores exatos em centavos (modo valor exato). */
  exactSum: Cents;
}

/** Valida e calcula a prévia, sempre pelo motor compartilhado. */
export function analyze(f: FormState, order: JoinOrder): Analysis {
  const expense = toExpense(f);
  const errors = validateExpense(expense, order);
  const total = effectiveAmount({ ...expense, amount: expense.amount });
  let splitError: ExpenseErrorCode | null = null;
  let amountError = false;
  const itemErrors: Partial<Record<string, ExpenseErrorCode>> = {};
  for (const e of errors) {
    if (e.scope === undefined) {
      if (e.code === 'amount-invalid') amountError = true;
      else splitError ??= e.code;
    } else itemErrors[String(e.scope)] ??= e.code;
  }
  if (f.mode === 'items' && f.amountStr.trim() !== '' && parseCents(f.amountStr) === null) amountError = true;

  const sharesBy = calcShares(expense, order);
  const used = (expense.items ?? []).reduce((s, it) => s + it.amount, 0);
  const pctSum = f.mode === 'pct' ? f.members.reduce((s, id) => s + weightNumber(f.w[id] ?? ''), 0) : 0;
  const exactSum = f.mode === 'exact' ? f.members.reduce((s, id) => s + (parseCents(f.w[id] ?? '') ?? 0), 0) : 0;
  const nameError = f.name.trim() === '';
  return {
    ok: !nameError && !amountError && splitError === null && Object.keys(itemErrors).length === 0 && errors.length === 0,
    total,
    shares: sharesBy,
    nameError,
    amountError,
    splitError,
    itemErrors,
    rest: f.mode === 'items' ? total - used : 0,
    pctSum: Math.round(pctSum * 10000) / 10000,
    exactSum,
  };
}

/** O que vai para a Function (só campos editáveis; pagamentos ficam de fora). */
export function toInput(f: FormState): ExpenseInput {
  const e = toExpense(f);
  const out: ExpenseInput = {
    name: f.name.trim(),
    amount: e.amount,
    payer: f.payer,
    members: [...e.members],
    mode: f.mode,
    date: f.date,
    tags: f.tags,
    note: f.note.trim(),
    longDesc: f.longDesc.trim(),
    icon: f.icon ?? null,
  };
  if (e.amount === null && f.mode !== 'items') out.amount = 0;
  if (e.w) out.w = e.w;
  if (f.mode === 'items') {
    out.items = (e.items ?? []).map((it, i) => ({
      ...(f.items[i]?.name.trim() ? { name: f.items[i]!.name.trim() } : {}),
      ...(f.items[i]?.icon ? { icon: f.items[i]!.icon } : {}),
      amount: it.amount,
      members: [...it.members],
      mode: it.mode ?? 'equal',
      ...(it.w ? { w: it.w } : {}),
    }));
    out.rest = [...f.rest];
    out.restMode = f.restMode;
    if (e.restW) out.restW = e.restW;
  }
  return out;
}

function weightText(mode: SplitMode | ExpenseMode, w: Weights | undefined, lang: Lang): WeightText {
  const out: Record<MemberId, string> = {};
  for (const [id, n] of Object.entries(w ?? {})) out[id] = mode === 'exact' ? formatInputCents(n, lang) : String(n).replace('.', dec(lang));
  return out;
}

/** Despesa salva → formulário (para editar). */
export function fromDoc(d: ExpenseDoc, lang: Lang): FormState {
  return {
    name: d.name,
    amountStr: formatInputCents(d.amount, lang),
    payer: d.payer,
    members: d.members,
    mode: d.mode,
    w: weightText(d.mode, d.w, lang),
    items: (d.items ?? []).map((it, i) => ({
      key: `i${i + 1}`,
      name: it.name ?? '',
      amountStr: formatInputCents(it.amount, lang),
      members: it.members,
      mode: it.mode ?? 'equal',
      w: weightText(it.mode ?? 'equal', it.w, lang),
      min: true,
      ...(it.icon ? { icon: it.icon } : {}),
    })),
    rest: d.rest ?? [],
    restMode: d.restMode ?? 'equal',
    restW: weightText(d.restMode ?? 'equal', d.restW, lang),
    date: d.date,
    tags: d.tags.filter((t) => t !== 'other'),
    note: d.note,
    longDesc: d.longDesc,
    ...(d.icon ? { icon: d.icon } : {}),
  };
}

/** A despesa como ficará depois de salvar (para mostrar na hora, antes do servidor responder). */
export function docFromInput(id: string, input: ExpenseInput, me: MemberId, version: number, prev?: ExpenseDoc): ExpenseDoc {
  const amount = effectiveAmount({ ...input, amount: input.amount } as Expense);
  const { amount: _amount, ...rest } = input;
  // Ao editar, o que a edição tirou (itens, pesos…) não pode sobrar da versão anterior.
  const base = prev
    ? (({ w: _w, items: _i, rest: _r, restMode: _rm, restW: _rw, ...keep }) => keep)(prev)
    : { paid: {}, pendConf: {}, proof: {}, receipt: null, paySeq: 0, author: me, deletedAt: null };
  return {
    ...base,
    ...rest,
    id,
    amount,
    tags: normalizeTags(input.tags),
    note: input.note ?? '',
    longDesc: input.longDesc ?? '',
    version,
    updatedBy: me,
    updatedAt: new Date(),
    ...(prev ? {} : { createdAt: new Date() }),
  } as ExpenseDoc;
}
