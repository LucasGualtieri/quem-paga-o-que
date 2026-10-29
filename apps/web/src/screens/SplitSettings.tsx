import { useMemo, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { AUTO_FINALIZE_DAYS, DEFAULT_CURRENCY, EMPTY_SPLIT_DAYS, endsOnAllowed, endsOnMillis, ENDS_ON_MAX_DAYS, PAY_MODES, PROOF_TTL_DAYS, type Currency, type PayMode, type ProofVisibility } from '@qpq/shared';
import { CurrencyPicker } from './CurrencyPicker.tsx';
import { Button, Card, Icon, SkeletonCard } from '../components/index.ts';
import { api } from '../data/api.ts';
import { useMoney, useSplit } from '../data/hooks.ts';
import { autoFinalizeAt, currencyOf, myMember, payModeOf, type ExpenseDoc, type Member, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, dayMonthYear } from '../lib/dates.ts';
import { useSplitEdits, withSplitEdits } from '../data/splitEdits.ts';
import { BackLink, todayStr } from './common.tsx';
import { SplitCover } from './Photos.tsx';
import { useSplitActions } from './SplitActions.tsx';
import { CurrencyProvider, useFmt } from '../lib/currency.ts';

/**
 * Configurações do split (spec 04): nome e capa, como registrar pagamentos e quem vê comprovantes.
 * Só admin muda, e cada mudança vale na hora (sem Salvar geral); membro vê só leitura.
 */
export default function SplitSettings() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const result = useSplit(id, uid);
  const edits = useSplitEdits();
  const server = result.status === 'ready' ? result.data : null;
  const split = useMemo(() => (server ? withSplitEdits(server, edits) : null), [server, edits]);
  const me = split && uid ? myMember(split, uid) : null;
  if (result.status === 'denied' || (split && uid && !me)) return <Navigate to="/" replace />;

  const page = (
    <main className="page">
      <header className="hdr">
        <BackLink to={`/s/${id}`} label={t('common.back')} />
        <h1 className="h3 hdr-mid">{t('config.title')}</h1>
      </header>
      {split && me ? (
        <SettingsBody split={split} me={me} />
      ) : (
        <div className="content sk-stack" aria-busy="true" aria-label={t('common.loading')}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
    </main>
  );
  return <CurrencyProvider value={split ? currencyOf(split) : DEFAULT_CURRENCY}>{page}</CurrencyProvider>;
}

function SettingsBody({ split, me }: { split: SplitDoc; me: Member }) {
  const { t } = useTranslation();
  const money = useMoney(split.id, true, split);
  const a = useSplitActions(split, me, money, true);
  const isOpen = split.status === 'open';
  const canEdit = me.admin && isOpen;
  const mode = payModeOf(split);
  const visibility = split.proofVisibility ?? 'all';
  const lang = useLang();

  const setMode = (value: PayMode) => {
    if (value === mode) return;
    a.editSplit({ payMode: value }, () => api.setPayMode({ splitId: split.id, mode: value }), t('config.modeSaved', { value: t(`config.mode.${value}`) }));
  };
  // Trocar a moeda não converte os valores (só o símbolo muda).
  const setCurrency = (value: Currency) => {
    if (value === currencyOf(split)) return;
    a.editSplit({ currency: value }, () => api.updateSplit({ splitId: split.id, currency: value }), t('currency.saved', { value }));
  };
  const setVisibility = (value: ProofVisibility) => {
    if (value === visibility) return;
    a.editSplit({ proofVisibility: value }, () => api.setProofVisibility({ splitId: split.id, value }), t('proofVis.saved', { value: t(`proofVis.${value}`) }));
  };
  // Membro (ou split finalizado): a mesma tela, só para ler.
  const lockNote = !me.admin ? t('config.adminOnly') : !isOpen ? t('config.doneNote') : null;

  return (
    <div className="content" style={{ gap: 20, paddingBottom: 40 }}>
      {lockNote && (
        <div className="info" role="note">
          <Icon name="lock" />
          <span>{lockNote}</span>
        </div>
      )}

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('config.identity')}</h2>
        </div>
        <Card className="card-pad config-identity">
          <SplitCover split={split} />
          <span className="ttl clamp2">{split.name}</span>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => a.perform('edit')}>
              <Icon name="pencil" size="sm" />
              {t('config.edit')}
            </Button>
          )}
        </Card>
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('currency.label')}</h2>
        </div>
        <CurrencyPicker id="split-currency" value={currencyOf(split)} disabled={!canEdit} onChange={setCurrency} />
        <p className="cap" style={{ padding: '8px 4px 0', whiteSpace: 'normal' }}>
          {t('currency.note')}
        </p>
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('config.payTitle')}</h2>
        </div>
        <PayModeOptions mode={mode} canEdit={canEdit} onChange={setMode} />
      </section>

      <section>
        <div className="sec-h">
          <h2 className="h4">{t('proofVis.title')}</h2>
        </div>
        <div className="list" role="radiogroup" aria-label={t('proofVis.title')}>
          {(['all', 'involved'] as const).map((v) => (
            <label key={v} className={`optrow ${me.admin ? '' : 'ro'}`}>
              <input type="radio" name="proof-visibility" checked={visibility === v} disabled={!me.admin} onChange={() => setVisibility(v)} />
              <span className="mid">
                <span className="ttl">{t(`proofVis.${v}`)}</span>
                <span className="cap" style={{ whiteSpace: 'normal' }}>
                  {t(v === 'all' ? 'proofVis.allSub' : 'proofVis.involvedSub')}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <Deadlines
        split={split}
        money={money}
        canEdit={canEdit}
        onEndsOn={(endsOn) =>
          a.editSplit({ endsOn }, () => api.updateSplit({ splitId: split.id, endsOn }), endsOn ? t('config.deadlines.endsSaved', { date: dayMonthYear(dateOf(endsOn), lang) }) : t('config.deadlines.endsCleared'))
        }
      />
      {a.sheets}
    </div>
  );
}

/**
 * Prazos do split (spec 04): "Termina em" (só admin muda) e os cronômetros do app, com o estado
 * deste split. Todos leem.
 */
function Deadlines({ split, money, canEdit, onEndsOn }: { split: SplitDoc; money: { expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }; canEdit: boolean; onEndsOn: (v: string | null) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const saved = split.endsOn ?? null;
  const [draft, setDraft] = useState(saved ?? '');
  const [prev, setPrev] = useState(saved);
  // Mudou no servidor (ou pelo Desfazer): o campo acompanha.
  if (prev !== saved) {
    setPrev(saved);
    setDraft(saved ?? '');
  }
  const day = (ymd: string) => dayMonthYear(dateOf(ymd), lang);
  const maxYmd = new Date(Date.now() + ENDS_ON_MAX_DAYS * 24 * 3600_000).toISOString().slice(0, 10);
  const dirty = draft !== (saved ?? '');
  const bad = dirty && draft !== '' && !endsOnAllowed(draft, Date.now());
  const DAY = 24 * 3600_000;

  const auto = autoFinalizeAt(split, money);
  const autoText =
    split.status === 'done'
      ? split.doneAt
        ? t(split.autoFinalized ? 'config.deadlines.autoDoneAuto' : 'config.deadlines.autoDone', { date: dayMonthYear(split.doneAt, lang) })
        : t('split.done')
      : auto
        ? t('config.deadlines.autoSoon', { date: dayMonthYear(auto.at, lang) })
        : saved
          ? t('config.deadlines.autoRuleEnds', { days: AUTO_FINALIZE_DAYS, date: dayMonthYear(new Date(endsOnMillis(saved) + AUTO_FINALIZE_DAYS * DAY - 1), lang) })
          : t('config.deadlines.autoRule', { days: AUTO_FINALIZE_DAYS });

  const rules: Array<[string, string]> = [
    [t('config.deadlines.autoTitle'), autoText],
    [t('config.deadlines.doneTitle'), t('config.deadlines.doneRule')],
    [t('config.deadlines.proofsTitle'), t('config.deadlines.proofsRule', { days: PROOF_TTL_DAYS })],
    [t('config.deadlines.emptyTitle'), t('config.deadlines.emptyRule', { days: EMPTY_SPLIT_DAYS })],
    [t('config.deadlines.inviteTitle'), t('config.deadlines.inviteRule')],
  ];

  return (
    <section>
      <div className="sec-h">
        <h2 className="h4">{t('config.deadlines.title')}</h2>
      </div>
      <div className="list">
        <div className="row2 ends-on">
          <label className="ttl" htmlFor="ends-on">
            {t('config.deadlines.endsOn')}
          </label>
          {canEdit ? (
            <>
              <div className="ends-row">
                <input id="ends-on" className={`input ${bad ? 'err' : ''}`} type="date" value={draft} min={todayStr()} max={maxYmd} aria-invalid={bad} onChange={(e) => setDraft(e.target.value)} />
                {dirty && !bad && draft !== '' && (
                  <Button size="sm" onClick={() => onEndsOn(draft)}>
                    {t('config.deadlines.endsSave')}
                  </Button>
                )}
              </div>
              {bad && (
                <p className="errmsg" role="alert">
                  <Icon name="alert" size="sm" />
                  {t('config.deadlines.endsErr', { date: day(maxYmd) })}
                </p>
              )}
              {saved && (
                <button
                  type="button"
                  className="linkbtn ends-clear"
                  onClick={() => {
                    setDraft('');
                    onEndsOn(null);
                  }}
                >
                  {t('config.deadlines.endsClear')}
                </button>
              )}
            </>
          ) : (
            <span className="cap" id="ends-on">
              {saved ? day(saved) : t('config.deadlines.endsNone')}
            </span>
          )}
          <p className="cap" style={{ whiteSpace: 'normal', margin: 0 }}>
            {t('config.deadlines.endsHint')}
          </p>
        </div>
        {rules.map(([title, text]) => (
          <div key={title} className="row2 deadline">
            <span className="ttl">{title}</span>
            <span className="cap" style={{ whiteSpace: 'normal' }}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * As duas opções de "Como registrar pagamentos", com a explicação para quem não conhece os modos:
 * frase-resumo e "Bom para…" sempre; "Ver exemplo" abre a explicação com valores (escolhida em
 * 29/10/2026 entre três formas).
 */
function PayModeOptions({ mode, canEdit, onChange }: { mode: PayMode; canEdit: boolean; onChange: (v: PayMode) => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const [shown, setShown] = useState<PayMode | null>(null);
  // Botão dentro do rótulo do rádio: não pode marcar a opção.
  const toggle = (e: MouseEvent, v: PayMode) => {
    e.preventDefault();
    e.stopPropagation();
    setShown(shown === v ? null : v);
  };

  return (
    <>
      <div className="list" role="radiogroup" aria-label={t('config.payTitle')}>
        {PAY_MODES.map((v) => (
          <label key={v} className={`optrow ${canEdit ? '' : 'ro'}`}>
            <input type="radio" name="pay-mode" checked={mode === v} disabled={!canEdit} onChange={() => onChange(v)} />
            <span className="mid">
              <span className="ttl">
                {t(`config.mode.${v}`)}
                {v === 'simple' && <span className="cap"> · {t('config.default')}</span>}
              </span>
              <span className="mode-head">{t(`config.modeHead.${v}`)}</span>
              {shown === v && <span className="cap mode-body">{t(`config.modeBody.${v}`, { a: fmt(5000), b: fmt(2000), c: fmt(3000) })}</span>}
              <span className="cap mode-fit">{t(`config.modeFit.${v}`)}</span>
              <button type="button" className="linkbtn mode-more" aria-expanded={shown === v} onClick={(e) => toggle(e, v)}>
                {t(shown === v ? 'config.modeExampleHide' : 'config.modeExample')}
              </button>
            </span>
          </label>
        ))}
      </div>
      <p className="cap" style={{ padding: '8px 4px 0', whiteSpace: 'normal' }}>
        {t('config.modeNote')}
      </p>
    </>
  );
}
