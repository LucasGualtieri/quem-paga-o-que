import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { PAY_MODES, type PayMode, type ProofVisibility } from '@qpq/shared';
import { Button, Card, Icon, SkeletonCard } from '../components/index.ts';
import { api } from '../data/api.ts';
import { useMoney, useSplit } from '../data/hooks.ts';
import { myMember, payModeOf, type Member, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useSplitEdits, withSplitEdits } from '../data/splitEdits.ts';
import { BackLink } from './common.tsx';
import { SplitCover } from './Photos.tsx';
import { useSplitActions } from './SplitActions.tsx';

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

  return (
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
}

function SettingsBody({ split, me }: { split: SplitDoc; me: Member }) {
  const { t } = useTranslation();
  const money = useMoney(split.id, true, split);
  const a = useSplitActions(split, me, money, true);
  const isOpen = split.status === 'open';
  const canEdit = me.admin && isOpen;
  const mode = payModeOf(split);
  const visibility = split.proofVisibility ?? 'all';

  const setMode = (value: PayMode) => {
    if (value === mode) return;
    a.editSplit({ payMode: value }, () => api.setPayMode({ splitId: split.id, mode: value }), t('config.modeSaved', { value: t(`config.mode.${value}`) }));
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
          <h2 className="h4">{t('config.payTitle')}</h2>
        </div>
        <div className="list" role="radiogroup" aria-label={t('config.payTitle')}>
          {PAY_MODES.map((v) => (
            <label key={v} className={`optrow ${canEdit ? '' : 'ro'}`}>
              <input type="radio" name="pay-mode" checked={mode === v} disabled={!canEdit} onChange={() => setMode(v)} />
              <span className="mid">
                <span className="ttl">
                  {t(`config.mode.${v}`)}
                  {v === 'simple' && <span className="cap"> · {t('config.default')}</span>}
                </span>
                <span className="cap" style={{ whiteSpace: 'normal' }}>
                  {t(`config.modeSub.${v}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="cap" style={{ padding: '8px 4px 0', whiteSpace: 'normal' }}>
          {t('config.modeNote')}
        </p>
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
      {a.sheets}
    </div>
  );
}
