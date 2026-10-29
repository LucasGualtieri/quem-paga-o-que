import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { TAGS } from '@qpq/shared';
import { installmentDates, MAX_INSTALLMENTS, splitInstallments, type ExpenseMode } from '@qpq/calc';
import { avatarColor, Button, Chip, Icon, PersonRow, Segmented, SkeletonCard, Stepper, Switch } from '../components/index.ts';
import { analyze, fromDoc, initialForm, setMode, toggleMember, toInput, type FormState } from '../data/expenseForm.ts';
import { useMoney, useSplit } from '../data/hooks.ts';
import { currencyOf, membersInOrder, myMember, orderOf, payModeOf, type ExpenseDoc, type Member, type SplitDoc } from '../data/model.ts';
import { touchesSettled } from '../data/settlements.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, dayMonthYear } from '../lib/dates.ts';
import { currencySymbol, formatCents, formatInputCents } from '../lib/money.ts';
import { amountInput, BackLink, todayStr, useWho } from './common.tsx';
import { ErrorLine, splitErrorText, splitStatus, WeightRows } from './ExpenseParts.tsx';
import { IconButton } from './EntryIcon.tsx';
import { ItemsEditor } from './ItemsEditor.tsx';
import { newExpenseId, useExpenseActions } from './useExpenseActions.ts';
import { CurrencyProvider } from '../lib/currency.ts';
import { ReceiptField } from './ReceiptField.tsx';
import { usePayActions } from './usePayActions.ts';
import { MemberAvatar } from './Photos.tsx';

// getRandomValues (e não randomUUID): funciona também fora de HTTPS, como no teste pela rede local.

function Body({ split, me, doc, warnSettled = false }: { split: SplitDoc; me: Member; doc?: ExpenseDoc; warnSettled?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const people = membersInOrder(split);
  const order = useMemo(() => orderOf(split), [split]);
  const whoName = useWho(split, me);
  const actions = useExpenseActions(split, me);
  const pay = usePayActions(split, me);
  // Foto do comprovante: 'keep' = como está; null = tirar; File = nova (vai depois de salvar).
  const [receipt, setReceipt] = useState<File | null | 'keep'>('keep');
  const currency = currencyOf(split);
  const fmt = (c: number) => formatCents(c, lang, { currency });
  // A versão que a pessoa está editando (decisão 8): fixa desde que abriu.
  const expectedVersion = useRef(doc?.version ?? 0).current;

  const [form, setForm] = useState<FormState>(() => (doc ? fromDoc(doc, lang) : initialForm(people, me.id, todayStr())));
  const [showErrors, setShowErrors] = useState(false);
  // Tocar em Salvar com algo faltando leva até o primeiro campo com problema.
  const formRef = useRef<HTMLFormElement>(null);
  const [jump, setJump] = useState(0);
  useEffect(() => {
    if (!jump) return;
    const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], .err, .errmsg');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const input = el.matches('input, textarea') ? el : el.querySelector<HTMLElement>('input, textarea');
    input?.focus({ preventScroll: true });
  }, [jump]);
  const [withOpen, setWithOpen] = useState(people.length <= 5);
  const [more, setMore] = useState(!!doc && (doc.note !== '' || doc.longDesc !== '' || !!doc.receipt || doc.tags.some((k) => k !== 'other')));

  const a = useMemo(() => analyze(form, order), [form, order]);
  const set = (change: Partial<FormState>) => setForm((f) => ({ ...f, ...change }));
  const isItems = form.mode === 'items';
  const selected = people.filter((p) => form.members.includes(p.id));
  const modes: SplitModeOption[] = [
    { value: 'equal', label: t('modes.equal') },
    { value: 'frac', label: t('modes.frac') },
    { value: 'pct', label: t('modes.pct') },
    { value: 'exact', label: t('modes.exact') },
  ];

  const back = doc ? `/s/${split.id}/despesa/${doc.id}` : `/s/${split.id}`;

  const submit = () => {
    if (!a.ok) {
      setShowErrors(true);
      setJump((n) => n + 1);
      // Itens com problema reabrem sozinhos.
      setForm((f) => ({ ...f, items: f.items.map((it, i) => (a.itemErrors[String(i)] ? { ...it, min: false } : it)) }));
      return;
    }
    const input = toInput(form);
    const receiptChange = (id: string) => {
      // Vai na fila da despesa, depois de salvar; não é edição (decisão 8).
      if (receipt instanceof File) void pay.setReceipt({ id, receipt: doc?.receipt ?? null }, receipt);
      else if (receipt === null && doc?.receipt?.path) void pay.setReceipt(doc, null);
    };
    if (doc) {
      actions.update(doc, input, expectedVersion);
      receiptChange(doc.id);
      void navigate(back, { replace: true });
    } else {
      const id = newExpenseId();
      actions.create(id, input);
      receiptChange(id);
      void navigate(back, { replace: true, state: { added: id } });
    }
  };

  const status = form.mode !== 'items' && form.mode !== 'equal' ? splitStatus(form.mode, form.members, form.w, a.total, lang, (k, o) => t(k, o ?? {}), currency) : null;
  const pctFill = form.mode === 'pct' ? a.pctSum : a.total > 0 ? (a.exactSum / a.total) * 100 : 0;
  const mine = a.shares[me.id] ?? 0;
  const per = selected.length ? Math.round(a.total / selected.length) : 0;
  const errText = splitErrorText(a.splitError, (k) => t(k));
  const showSplitErr = !!errText && (showErrors || form.mode !== 'equal') && a.total > 0;
  // O que falta, no próprio botão (ele fica lá embaixo, longe dos campos).
  const missing = [
    a.nameError && t('expense.form.missDesc'),
    a.amountError && t('expense.form.missAmount'),
    a.splitError === 'no-members' ? t('expense.form.missWho') : a.splitError && form.mode !== 'items' ? t('expense.form.missSplit') : null,
    (Object.keys(a.itemErrors).length > 0 || (form.mode === 'items' && a.splitError)) && t('expense.form.missItems'),
  ].filter((x): x is string => !!x);
  const missingText = missing.length ? t('expense.form.missing', { list: new Intl.ListFormat(lang === 'en' ? 'en' : 'pt-BR', { type: 'conjunction' }).format(missing) }) : null;

  const page = (
    <main className="page">
      <header className="hdr">
        <BackLink to={back} label={t('expense.form.close')} icon="x" />
        <div className="hdr-mid">
          <h1 className="h3">{doc ? t('expense.form.titleEdit') : t('expense.form.titleNew')}</h1>
          <p className="cap trunc">{split.name}</p>
        </div>
      </header>

      <form
        ref={formRef}
        className="content form-stack"
        style={{ paddingTop: 4, paddingBottom: 150 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {warnSettled && (
          <div className="info">
            <Icon name="alert" />
            <span>{t('expense.changesSettled')}</span>
          </div>
        )}
        <div>
          <label className="label" htmlFor="ad-desc">
            {t('expense.form.desc')} <span className="req" aria-hidden="true">*</span>
          </label>
          <div className="desc-row">
          <IconButton value={form.icon} fallback={form} label={t('iconPicker.choose')} onChange={(icon) => setForm((f) => { const { icon: _old, ...rest } = f; return icon ? { ...rest, icon } : rest; })} />
          <input
            id="ad-desc"
            className={`input ${showErrors && a.nameError ? 'err' : ''}`}
            value={form.name}
            placeholder={t('expense.form.descPh')}
            autoComplete="off"
            maxLength={80}
            aria-required="true"
            aria-invalid={showErrors && a.nameError ? true : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
          </div>
          {showErrors && a.nameError && <ErrorLine>{t('expense.form.descErr')}</ErrorLine>}
        </div>

        <div>
          <label className="label" htmlFor="ad-amt">
            {t('expense.form.amount')} <span className="req" aria-hidden="true">*</span>
          </label>
          <div className={`amtbox ${showErrors && a.amountError ? 'err' : ''}`}>
            <span className="cur" aria-hidden="true">
              {currencySymbol(currency, lang)}
            </span>
            <input
              id="ad-amt"
              className="amtinput"
              {...amountInput(form.amountStr, lang, (amountStr) => set({ amountStr }))}
              placeholder={isItems && a.total > 0 ? formatInputCents(a.total, lang) : t('expense.form.amountPh')}
              autoComplete="off"
              aria-required="true"
              aria-invalid={showErrors && a.amountError ? true : undefined}
            />
          </div>
          {showErrors && a.amountError && <ErrorLine>{t('expense.form.amtErr')}</ErrorLine>}
        </div>

        <div>
          <span className="label">{t('expense.form.paidBy')}</span>
          <div className="chiprow bleed" role="radiogroup" aria-label={t('expense.form.paidBy')}>
            {people.map((p) => (
              <button key={p.id} type="button" className={`chip hasav ${form.payer === p.id ? 'on' : ''}`} role="radio" aria-checked={form.payer === p.id} onClick={() => set({ payer: p.id })}>
                <MemberAvatar member={p} size="sm" />
                {whoName(p.id)}
              </button>
            ))}
          </div>
        </div>

        {!isItems && (
          <div>
            <div className="withcard">
              {withOpen ? (
                <>
                  <div className="withhead">
                    <span className="label">
                      {t('expense.form.splitWith')} · <span className="amt">{selected.length}/{people.length}</span>
                    </span>
                    <button type="button" className="linkbtn" onClick={() => setForm((f) => ({ ...f, members: f.members.length === people.length ? [] : people.map((p) => p.id), w: f.members.length === people.length ? f.w : { ...f.w } }))}>
                      {form.members.length === people.length ? t('expense.form.clearAll') : t('expense.form.all')}
                    </button>
                    <button type="button" className="linkbtn" aria-expanded="true" onClick={() => setWithOpen(false)}>
                      {t('expense.form.collapse')}
                      <Icon name="up" size="sm" />
                    </button>
                  </div>
                  <div role="group" aria-label={t('expense.form.splitWith')}>
                    {people.map((p) => (
                      <PersonRow
                        key={p.id}
                        name={whoName(p.id)}
                        avatarName={p.name}
                        color={avatarColor(p.joinOrder)}
                        avatar={<MemberAvatar member={p} />}
                        me={p.id === me.id}
                        selected={form.members.includes(p.id)}
                        trailing={form.members.includes(p.id) && a.total > 0 ? fmt(a.shares[p.id] ?? 0) : '—'}
                        onClick={() => setForm((f) => toggleMember(f, p.id, people))}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <button type="button" className="withmin" aria-expanded="false" onClick={() => setWithOpen(true)}>
                  <span className="withtop">
                    <span className="mid">
                      <span className="label" style={{ margin: 0 }}>
                        {t('expense.form.splitWith')}
                      </span>
                      <span className="ttl">
                        {t('expense.form.ofPeople', { n: selected.length, total: people.length })}
                        {form.mode === 'equal' && a.total > 0 && selected.length > 0 ? ` · ${fmt(per)}` : ''}
                      </span>
                    </span>
                    <Icon name="down" />
                  </span>
                  <span className="avstack" aria-hidden="true">
                    {selected.slice(0, 5).map((p) => (
                      <MemberAvatar key={p.id} member={p} />
                    ))}
                    {selected.length > 5 && <span className="av more">+{selected.length - 5}</span>}
                  </span>
                </button>
              )}
            </div>
            {a.splitError === 'no-members' && <ErrorLine>{t('expense.form.selectSome')}</ErrorLine>}
          </div>
        )}

        <div>
          <span className="label">{t('expense.form.howSplit')}</span>
          {!isItems && (
            <Segmented<ExpenseMode> label={t('expense.form.howSplit')} value={form.mode} onChange={(m) => setForm((f) => setMode(f, m, lang))} options={modes.map((m) => ({ value: m.value as ExpenseMode, label: m.label }))} />
          )}
          <button type="button" className={`itemsbtn ${isItems ? 'on' : ''}`} aria-pressed={isItems} onClick={() => setForm((f) => setMode(f, isItems ? 'equal' : 'items', lang))}>
            <span className="tagico" aria-hidden="true">
              <Icon name="list" />
            </span>
            <span className="mid">
              <span className="ttl">{t('expense.form.byItems')}</span>
              <span className="cap" style={{ whiteSpace: 'normal' }}>
                {t('expense.form.byItemsSub')}
              </span>
            </span>
            {isItems && <Icon name="check" className="accent-ic" />}
          </button>

          {isItems ? (
            <ItemsEditor form={form} setForm={setForm} people={people} analysis={a} whoName={whoName} showErrors={showErrors} />
          ) : (
            <div className={`result ${showSplitErr ? 'bad' : ''}`} aria-live="polite">
              {form.mode === 'equal' ? (
                <>
                  <div className="per-line">
                    <span className="big amt">{fmt(per)}</span>
                    <span className="muted" style={{ fontWeight: 700 }}>
                      {t('expense.form.perPerson')}
                    </span>
                  </div>
                  <p className="cap">
                    {t('expense.form.ofPeople', { n: selected.length, total: people.length })}
                    {form.members.includes(me.id) && a.total > 0 ? ` · ${t('expense.form.yourShare', { amount: fmt(mine) })}` : ''}
                    {selected.length > 0 && a.total % selected.length !== 0 ? ` · ${t('expense.form.cents')}` : ''}
                  </p>
                </>
              ) : (
                <div className="inl">
                  <p className="cap">{t(`expense.form.${form.mode}Hint`)}</p>
                  <div className="rows">
                    <WeightRows
                      mode={form.mode as 'frac' | 'pct' | 'exact'}
                      people={selected}
                      w={form.w}
                      whoName={whoName}
                      caption={(id) => fmt(a.shares[id] ?? 0)}
                      onChange={(id, v) => setForm((f) => ({ ...f, w: { ...f.w, [id]: v } }))}
                    />
                  </div>
                  {status && (
                    <>
                      <div className="tot" aria-live="polite">
                        <Icon name={status.ok ? 'check' : 'alert'} size="sm" className={status.ok ? 'pos' : 'neg'} />
                        <span className={status.ok ? 'st-ok' : 'st-bad'}>{status.text}</span>
                      </div>
                      <div className="prog" aria-hidden="true">
                        <span className={`bar ${status.ok ? 'ok' : pctFill > 100 ? 'over' : ''}`} style={{ width: `${Math.max(0, Math.min(100, pctFill))}%` }} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {showSplitErr && errText !== t('expense.form.selectSome') && <ErrorLine>{errText}</ErrorLine>}
        </div>

        {/* Parcelada: cada parcela só entra no saldo quando vence (spec 05). */}
        <div className="plan-box">
          <div className="plan-row">
            <span className="mid">
              <span className="ttl">{t('expense.form.plan')}</span>
              <span className="cap">{t('expense.form.planHint')}</span>
            </span>
            <Switch checked={!!form.plan} label={t('expense.form.plan')} onChange={(on) => set({ plan: on ? { count: 2, first: form.date } : null })} />
          </div>
          {form.plan && (
            <>
              <div className="plan-fields">
                <div>
                  <span className="label">{t('expense.form.planCount')}</span>
                  <Stepper value={form.plan.count} min={2} max={MAX_INSTALLMENTS} onChange={(count) => set({ plan: { ...form.plan!, count } })} />
                </div>
                <div>
                  <label className="label" htmlFor="ad-first">
                    {t('expense.form.planFirst')}
                  </label>
                  <input id="ad-first" className="input" type="date" value={form.plan.first} onChange={(e) => e.target.value && set({ plan: { ...form.plan!, first: e.target.value } })} />
                </div>
              </div>
              {a.total > 0 && (
                <p className="cap plan-sum">
                  {t('expense.form.planSum', { count: form.plan.count, amount: fmt(splitInstallments(a.total, form.plan.count)[1]!), last: dayMonthYear(dateOf(installmentDates(form.plan).at(-1)!), lang) })}
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <button type="button" className="morebtn" aria-expanded={more} onClick={() => setMore(!more)}>
            <span>
              <span>{t('expense.form.moreDetails')}</span>
              <span className="cap" style={{ fontWeight: 600 }}>
                {t('expense.form.moreHint')}
              </span>
            </span>
            <Icon name={more ? 'up' : 'down'} />
          </button>
          {more && (
            <div className="morebody">
              <div>
                <label className="label" htmlFor="ad-date">
                  {t('expense.form.date')}
                </label>
                <input id="ad-date" className="input" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
              <div>
                <span className="label">{t('expense.form.tags')}</span>
                <div className="chiprow wrap" role="group" aria-label={t('expense.form.tags')}>
                  {TAGS.filter((k) => k !== 'other').map((k) => (
                    <Chip key={k} pressed={form.tags.includes(k)} onClick={() => set({ tags: form.tags.includes(k) ? form.tags.filter((x) => x !== k) : [...form.tags, k] })}>
                      {t(`expense.tags.${k}`)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="ad-long">
                  {t('expense.form.longDesc')}
                </label>
                <textarea id="ad-long" className="input" value={form.longDesc} maxLength={2000} placeholder={t('expense.form.longPh')} onChange={(e) => set({ longDesc: e.target.value })} />
              </div>
              <ReceiptField current={doc?.receipt ?? null} value={receipt} onChange={setReceipt} />
              <div>
                <label className="label" htmlFor="ad-note">
                  {t('expense.form.note')}
                </label>
                <textarea id="ad-note" className="input" value={form.note} maxLength={500} placeholder={t('expense.form.notePh')} onChange={(e) => set({ note: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        <div className="bottombar">
          <Button type="submit" block className={missingText ? 'btn-pending' : undefined}>
            {missingText ?? (
              <>
                {doc ? t('expense.form.saveChanges') : t('expense.form.save')}
                {a.total > 0 && <span style={{ opacity: 0.8, fontWeight: 600 }}>· {fmt(a.total)}</span>}
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
  return <CurrencyProvider value={currencyOf(split)}>{page}</CurrencyProvider>;
}

interface SplitModeOption {
  value: string;
  label: string;
}

/** Nova despesa (/s/:id/despesa/nova) e editar (/s/:id/despesa/:expId/editar). */
export default function ExpenseForm() {
  const { id = '', expId } = useParams();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const result = useSplit(id, uid);
  const split = result.status === 'ready' ? result.data : null;
  const { expenses, payments, loaded } = useMoney(id, !!split, split);

  if (result.status === 'denied') return <Navigate to="/" replace />;
  if (!split || !uid || (expId && !loaded)) {
    return (
      <main className="page">
        <div className="content" aria-busy="true">
          <SkeletonCard />
        </div>
      </main>
    );
  }
  const me = myMember(split, uid);
  if (!me || split.status !== 'open') return <Navigate to={`/s/${id}`} replace />;

  if (expId) {
    const doc = expenses.find((e) => e.id === expId);
    if (!doc || doc.deletedAt) return <Navigate to={`/s/${id}`} replace />;
    // Só quem lançou ou um admin edita (spec 04).
    if (doc.author !== me.id && !me.admin) return <Navigate to={`/s/${id}/despesa/${expId}`} replace />;
    // Simplificado: editar é sempre permitido, mas avisa se o par já acertou (spec 06).
    const warn = payModeOf(split) === 'simple' && touchesSettled(doc, split, payments);
    return <Body key={doc.id} split={split} me={me} doc={doc} warnSettled={warn} />;
  }
  return <Body split={split} me={me} />;
}

