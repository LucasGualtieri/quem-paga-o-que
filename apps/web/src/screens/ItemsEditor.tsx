import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, avatarColor, Button, Icon } from '../components/index.ts';
import { itemWithMode, newItem, restWithMode, type Analysis, type FormState, type ItemForm } from '../data/expenseForm.ts';
import type { Member } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents, parseCents } from '../lib/money.ts';
import { ErrorLine, ModePicker, splitStatus, WeightRows, WhoToggles } from './ExpenseParts.tsx';
import { IconButton } from './EntryIcon.tsx';

interface Props {
  form: FormState;
  setForm: (f: FormState | ((f: FormState) => FormState)) => void;
  people: readonly Member[];
  analysis: Analysis;
  whoName: (id: string) => string;
  /** Mostra os erros (depois da primeira tentativa de salvar). */
  showErrors: boolean;
}

function AvatarStack({ ids, people, size }: { ids: readonly string[]; people: readonly Member[]; size?: 'sm' }) {
  const by = new Map(people.map((p) => [p.id, p]));
  const shown = ids.slice(0, 3);
  const more = ids.length - shown.length;
  return (
    <span className="avstack" aria-hidden="true">
      {shown.map((id) => (
        <Avatar key={id} name={by.get(id)?.name ?? '?'} color={avatarColor(by.get(id)?.joinOrder ?? 0)} {...(size ? { size } : {})} />
      ))}
      {more > 0 && <span className={`av more ${size ?? ''}`}>+{more}</span>}
    </span>
  );
}

/** Dividir por itens: cada item com quem consumiu e modo próprio, mais o "Resto da compra". */
export function ItemsEditor({ form, setForm, people, analysis, whoName, showErrors }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = (c: number) => formatCents(c, lang);
  const [seq, setSeq] = useState(form.items.length + 1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const total = analysis.total;

  const patchItem = (key: string, change: (it: ItemForm) => ItemForm) => setForm((f) => ({ ...f, items: f.items.map((it) => (it.key === key ? change(it) : it)) }));
  const allMin = form.items.length > 0 && form.items.every((it) => it.min);
  const itemTitle = (it: ItemForm, i: number) => it.name.trim() || t('expense.form.itemN', { n: i + 1 });

  const sharesLine = (ids: readonly string[], mode: ItemForm['mode'], w: ItemForm['w'], amount: number) => splitStatus(mode, ids, w, amount, lang, (k, o) => t(k, o ?? {}));

  const restStatus = sharesLine(form.rest, form.restMode, form.restW, Math.max(0, analysis.rest));
  const restOk = analysis.rest >= 0;
  const distributed = Object.values(analysis.shares).reduce((s, v) => s + v, 0);
  const bad = !analysis.ok && (showErrors || analysis.rest < 0 || analysis.splitError === 'items-exceed-total');
  const itemShares = (ids: readonly string[]) => ids.length;

  return (
    <div className="items">
      {form.items.length > 1 && (
        <div className="itemsbar">
          <span className="cap amt" style={{ fontWeight: 700 }}>
            {t('expense.form.itemsCount', { count: form.items.length })}
          </span>
          <button type="button" className="linkbtn" onClick={() => setForm((f) => ({ ...f, items: f.items.map((it) => ({ ...it, min: !allMin })) }))}>
            {allMin ? t('expense.form.expandAll') : t('expense.form.minimizeAll')}
          </button>
        </div>
      )}

      {form.items.map((it, i) => {
        const err = showErrors ? analysis.itemErrors[String(i)] : undefined;
        const title = itemTitle(it, i);
        const amount = parseCents(it.amountStr) ?? 0;
        // Item com erro reabre sozinho.
        const min = it.min && !err;
        const status = sharesLine(it.members, it.mode, it.w, amount);
        return (
          <div key={it.key} className={`itemcard ${err ? 'err' : ''}`}>
            {min ? (
              <button type="button" className="imin" aria-expanded="false" aria-label={t('expense.form.expandItem', { name: title })} onClick={() => patchItem(it.key, (x) => ({ ...x, min: false }))}>
                <span className="icol" aria-hidden="true">
                  <Icon name="chevron" />
                </span>
                <span className="mid">
                  <span className="ttl">{title}</span>
                  <span className="cap">{t('expense.form.minSub', { mode: t(`expense.form.modesShort.${it.mode}`), n: itemShares(it.members), total: people.length })}</span>
                </span>
                <AvatarStack ids={it.members} people={people} size="sm" />
                <span className="amt strong" style={{ minWidth: 64, textAlign: 'right' }}>
                  {fmt(amount)}
                </span>
              </button>
            ) : (
              <>
                <div className="itop">
                  <button type="button" className="iconbtn icol" aria-expanded="true" aria-label={t('expense.form.minimize')} onClick={() => patchItem(it.key, (x) => ({ ...x, min: true }))}>
                    <Icon name="down" />
                  </button>
                  <IconButton value={it.icon} fallback="item" size="sm" label={t('iconPicker.chooseItem')} onChange={(icon) => patchItem(it.key, (x) => { const { icon: _old, ...rest } = x; return icon ? { ...rest, icon } : rest; })} />
                  <input className="iname" value={it.name} placeholder={t('expense.form.itemN', { n: i + 1 })} aria-label={t('expense.form.itemPh')} autoComplete="off" onChange={(e) => patchItem(it.key, (x) => ({ ...x, name: e.target.value }))} />
                  <div className="minibox">
                    <span>R$</span>
                    <input inputMode="numeric" value={it.amountStr} placeholder={t('expense.form.amountPh')} aria-label={t('expense.form.itemAmount')} style={{ width: 62 }} onChange={(e) => patchItem(it.key, (x) => ({ ...x, amountStr: e.target.value }))} />
                  </div>
                  <button type="button" className="iconbtn" aria-label={t('expense.form.removeItem', { name: title })} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((x) => x.key !== it.key) }))}>
                    <Icon name="x" />
                  </button>
                </div>
                <WhoToggles
                  people={people}
                  selected={it.members}
                  onChange={(ids) => patchItem(it.key, (x) => itemWithMode({ ...x, members: ids }, x.mode, lang))}
                  whoName={whoName}
                  label={t('expense.form.who', { name: title })}
                  expanded={!!expanded[it.key]}
                  onExpand={() => setExpanded((e) => ({ ...e, [it.key]: !e[it.key] }))}
                />
                {it.mode === 'equal' && it.members.length > 0 && amount > 0 && (
                  <p className="cap amt" style={{ fontWeight: 700, padding: '0 4px 0 22px' }}>
                    {t('expense.form.eachOf', { amount: fmt(Math.round(amount / it.members.length)), n: it.members.length, total: people.length })}
                  </p>
                )}
                <ModePicker short className="isg" mode={it.mode} label={title} onChange={(m) => patchItem(it.key, (x) => itemWithMode(x, m, lang))} />
                {it.mode !== 'equal' && (
                  <div className="iwrows">
                    <WeightRows
                      compact
                      mode={it.mode}
                      people={people.filter((p) => it.members.includes(p.id))}
                      w={it.w}
                      whoName={whoName}
                      onChange={(id, v) => patchItem(it.key, (x) => ({ ...x, w: { ...x.w, [id]: v } }))}
                    />
                    {status && (
                      <p className={`cap amt ${status.ok ? 'st-ok' : 'st-bad'}`} style={{ fontWeight: 700, padding: '2px 0 6px' }}>
                        {status.text}
                      </p>
                    )}
                  </div>
                )}
                {err && (
                  <div style={{ padding: '0 8px 6px 22px' }}>
                    <ErrorLine>{err === 'amount-invalid' ? t('expense.form.itemErrAmount') : err === 'no-members' ? t('expense.form.itemErrWho') : t('expense.form.itemErrSplit')}</ErrorLine>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <Button
        variant="secondary"
        className="dashbtn"
        block
        icon={<Icon name="plus" />}
        onClick={() => {
          setForm((f) => ({ ...f, items: [...f.items.map((x) => ({ ...x, min: x.members.length > 0 && parseCents(x.amountStr) !== null })), newItem(`i${seq}`, people.map((p) => p.id))] }));
          setSeq(seq + 1);
        }}
      >
        {t('expense.form.addItem')}
      </Button>

      <div className="itemcard rest">
        <div className="itop" style={{ minHeight: 40 }}>
          <span className="inum" aria-hidden="true">
            +
          </span>
          <span className="ttl" style={{ flex: 1 }}>
            {t('expense.form.restTitle')}
          </span>
          <span className={`amt strong ${restOk ? '' : 'st-bad'}`} style={{ paddingRight: 8 }}>
            {fmt(Math.max(0, analysis.rest))}
          </span>
        </div>
        <p className="cap" style={{ paddingLeft: 32 }}>
          {t('expense.form.restHint')}
        </p>
        <WhoToggles
          people={people}
          selected={form.rest}
          onChange={(ids) => setForm((f) => restWithMode({ ...f, rest: ids }, f.restMode, lang))}
          whoName={whoName}
          label={t('expense.form.restTitle')}
          expanded={!!expanded.rest}
          onExpand={() => setExpanded((e) => ({ ...e, rest: !e.rest }))}
        />
        <p className={`cap amt ${showErrors && analysis.itemErrors.rest ? 'st-bad' : ''}`} style={{ fontWeight: 700, padding: '0 4px 4px 22px' }}>
          {analysis.rest > 0 ? t('expense.form.restCap', { amount: fmt(analysis.rest) }) : t('expense.form.restNone')}
        </p>
        <ModePicker short className="isg" mode={form.restMode} label={t('expense.form.restTitle')} onChange={(m) => setForm((f) => restWithMode(f, m, lang))} />
        {form.restMode !== 'equal' && (
          <div className="iwrows">
            <WeightRows
              compact
              mode={form.restMode}
              people={people.filter((p) => form.rest.includes(p.id))}
              w={form.restW}
              whoName={whoName}
              onChange={(id, v) => setForm((f) => ({ ...f, restW: { ...f.restW, [id]: v } }))}
            />
            {restStatus && (
              <p className={`cap amt ${restStatus.ok ? 'st-ok' : 'st-bad'}`} style={{ fontWeight: 700, padding: '2px 0 6px' }}>
                {restStatus.text}
              </p>
            )}
          </div>
        )}
        {showErrors && analysis.itemErrors.rest && (
          <div style={{ padding: '0 8px 6px 22px' }}>
            <ErrorLine>{analysis.itemErrors.rest === 'no-members' ? t('expense.form.restErrWho') : t('expense.form.itemErrSplit')}</ErrorLine>
          </div>
        )}
      </div>

      <div className={`result ${showErrors && !analysis.ok && total > 0 ? 'bad' : ''}`} aria-live="polite">
        <p className="label" style={{ margin: 0 }}>
          {t('expense.form.perEach')}
        </p>
        <div className="sharegrid">
          {people
            .filter((p) => (analysis.shares[p.id] ?? 0) > 0)
            .map((p) => (
              <div key={p.id} className="shareitem">
                <Avatar name={p.name} color={avatarColor(p.joinOrder)} size="sm" />
                <span>{whoName(p.id)}</span>
                <span className="amt">{fmt(analysis.shares[p.id] ?? 0)}</span>
              </div>
            ))}
        </div>
        <div className="tot" style={{ fontSize: 13.5 }}>
          <Icon name={bad ? 'alert' : 'check'} size="sm" className={bad ? 'neg' : 'pos'} />
          <span className={`amt ${bad ? 'st-bad' : 'st-ok'}`} style={{ whiteSpace: 'normal' }}>
            {analysis.splitError === 'items-exceed-total' ? t('expense.form.itemsExceed') : analysis.splitError === 'no-items' ? t('expense.form.noItems') : bad ? t('expense.form.splitErr') : `${t('expense.form.allGood')} · ${fmt(total)}`}
          </span>
        </div>
        <div className="prog" aria-hidden="true">
          <span className={`bar ${analysis.rest < 0 ? 'over' : distributed === total && total > 0 ? 'ok' : ''}`} style={{ width: `${total > 0 ? Math.min(100, (distributed / total) * 100) : 0}%` }} />
        </div>
      </div>
    </div>
  );
}
