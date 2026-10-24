import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { TAGS } from '@qpq/shared';
import type { ExpenseMode } from '@qpq/calc';
import { Avatar, avatarColor, Button, Chip, Icon, PersonRow, Segmented, SkeletonCard } from '../components/index.ts';
import { analyze, fromDoc, initialForm, setMode, toggleMember, toInput, type FormState } from '../data/expenseForm.ts';
import { useExpenses, useSplit } from '../data/hooks.ts';
import { membersInOrder, myMember, orderOf, type ExpenseDoc, type Member, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { BackLink, todayStr, useWho } from './common.tsx';
import { ErrorLine, splitErrorText, splitStatus, WeightRows } from './ExpenseParts.tsx';
import { IconButton } from './EntryIcon.tsx';
import { ItemsEditor } from './ItemsEditor.tsx';
import { useExpenseActions } from './useExpenseActions.ts';
import { ReceiptField } from './ReceiptField.tsx';
import { usePayActions } from './usePayActions.ts';

const newExpenseId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 20);

function Body({ split, me, doc }: { split: SplitDoc; me: Member; doc?: ExpenseDoc }) {
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
  const fmt = (c: number) => formatCents(c, lang);
  // A versão que a pessoa está editando (decisão 8): fixa desde que abriu.
  const expectedVersion = useRef(doc?.version ?? 0).current;

  const [form, setForm] = useState<FormState>(() => (doc ? fromDoc(doc, lang) : initialForm(people, me.id, todayStr())));
  const [showErrors, setShowErrors] = useState(false);
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

  const status = form.mode !== 'items' && form.mode !== 'equal' ? splitStatus(form.mode, form.members, form.w, a.total, lang, (k, o) => t(k, o ?? {})) : null;
  const pctFill = form.mode === 'pct' ? a.pctSum : a.total > 0 ? (a.exactSum / a.total) * 100 : 0;
  const mine = a.shares[me.id] ?? 0;
  const per = selected.length ? Math.round(a.total / selected.length) : 0;
  const errText = splitErrorText(a.splitError, (k) => t(k));
  const showSplitErr = !!errText && (showErrors || form.mode !== 'equal') && a.total > 0;

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to={back} label={t('expense.form.close')} icon="x" />
        <div className="hdr-mid">
          <h1 className="h3">{doc ? t('expense.form.titleEdit') : t('expense.form.titleNew')}</h1>
          <p className="cap trunc">{split.name}</p>
        </div>
      </header>

      <form
        className="content form-stack"
        style={{ paddingTop: 4, paddingBottom: 150 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
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
              R$
            </span>
            <input
              id="ad-amt"
              className="amtinput"
              inputMode="decimal"
              value={form.amountStr}
              placeholder={isItems && a.total > 0 ? formatCents(a.total, lang).replace('R$ ', '') : t('expense.form.amountPh')}
              autoComplete="off"
              aria-required="true"
              aria-invalid={showErrors && a.amountError ? true : undefined}
              onChange={(e) => set({ amountStr: e.target.value })}
            />
          </div>
          {showErrors && a.amountError && <ErrorLine>{t('expense.form.amtErr')}</ErrorLine>}
        </div>

        <div>
          <span className="label">{t('expense.form.paidBy')}</span>
          <div className="chiprow bleed" role="radiogroup" aria-label={t('expense.form.paidBy')}>
            {people.map((p) => (
              <button key={p.id} type="button" className={`chip hasav ${form.payer === p.id ? 'on' : ''}`} role="radio" aria-checked={form.payer === p.id} onClick={() => set({ payer: p.id })}>
                <Avatar name={p.name} color={avatarColor(p.joinOrder)} size="sm" />
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
                      <Avatar key={p.id} name={p.name} color={avatarColor(p.joinOrder)} />
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
          <Button type="submit" block>
            {doc ? t('expense.form.saveChanges') : t('expense.form.save')}
            {a.total > 0 && <span style={{ opacity: 0.8, fontWeight: 600 }}>· {fmt(a.total)}</span>}
          </Button>
        </div>
      </form>
    </main>
  );
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
  const { expenses, loaded } = useExpenses(id, !!split);

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
    return <Body key={doc.id} split={split} me={me} doc={doc} />;
  }
  return <Body split={split} me={me} />;
}

