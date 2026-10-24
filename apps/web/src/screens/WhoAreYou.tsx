import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { cleanName, coverColor, isValidName, nameKey, type ErrorDetails, type PreviewInviteResponse } from '@qpq/shared';
import { Avatar, avatarColor, Button, Card, Cover, Icon, SkeletonCard, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { trackJoin } from '../data/local.ts';
import { continueAsGuest, useSession } from '../data/session.ts';
import { BackLink } from './common.tsx';
import { useReasonText } from './reasons.ts';
import { SplitGone } from './SplitGone.tsx';

type State = { status: 'loading' } | { status: 'ready'; data: PreviewInviteResponse } | { status: 'error'; details: ErrorDetails | null };

export default function WhoAreYou() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const reasonText = useReasonText();
  const session = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [pick, setPick] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState('');
  const returned = (location.state as { error?: ErrorDetails } | null)?.error ?? null;

  // Quem abre o convite não precisa de conta (spec 03): vira convidado na hora.
  useEffect(() => {
    if (session.status === 'signedOut') void continueAsGuest();
  }, [session.status]);

  useEffect(() => {
    if (session.status !== 'ready') return;
    api.previewInvite({ code }).then(
      (data) => setState({ status: 'ready', data }),
      (error) => setState({ status: 'error', details: detailsOf(error) }),
    );
  }, [code, session.status]);

  if (state.status === 'ready' && state.data.alreadyMember) return <Navigate to={`/s/${state.data.splitId}`} replace />;
  // Convite de um split apagado: explica o que aconteceu.
  if (state.status === 'error' && state.details?.reason === 'split-gone' && state.details.splitId) return <SplitGone splitId={state.details.splitId} />;

  const data = state.status === 'ready' ? state.data : null;
  const typed = cleanName(newName);
  // O aviso cita quem já está no split ("Já tem alguém chamado Beatriz aqui").
  const dup = isNew && data && typed ? data.members.find((m) => nameKey(m.name) === nameKey(typed)) : undefined;
  const chosen = data?.members.find((m) => m.id === pick);
  const ready = isNew ? isValidName(typed) && !dup : !!chosen;
  const cta = isNew ? (typed ? t('who.joinAs', { name: typed }) : t('who.type')) : chosen ? t('who.joinAs', { name: chosen.name }) : t('who.pick');

  const confirm = () => {
    if (!data || !ready) return;
    const req = isNew ? { code, newName: typed } : { code, memberId: pick! };
    // Otimista: o split abre na hora (carregando) e passa a ler quando a entrada é confirmada.
    const p = api.joinSplit(req).then(
      () => toast.show({ text: isNew ? t('who.joinedAs', { name: typed, split: data.name }) : t('who.joined', { split: data.name }) }),
      (error) => {
        void navigate(`/convite/${code}`, { replace: true, state: { error: detailsOf(error) } });
        throw error;
      },
    );
    trackJoin(data.splitId, p.catch(() => {}));
    void navigate(`/s/${data.splitId}`);
  };

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/entrar" label={t('common.back')} />
        <h1 className="h3 hdr-mid">{t('who.title')}</h1>
      </header>
      <div className="content" style={{ gap: 16 }}>
        {state.status === 'loading' && <SkeletonCard />}
        {state.status === 'error' && (
          <div className="alert" role="alert">
            <Icon name="alert" size="sm" />
            <span>{reasonText(state.details)}</span>
          </div>
        )}
        {returned && (
          <div className="alert" role="alert">
            <Icon name="alert" size="sm" />
            <span>{reasonText(returned)}</span>
          </div>
        )}
        {data && (
          <>
            <Card className="split-head">
              <Cover emoji={data.emoji} color={coverColor(data.emoji)} />
              <span className="mid">
                <span className="ttl" style={{ fontSize: 17 }}>
                  {data.name}
                </span>
                <span className="cap">
                  {t('split.people', { count: data.members.length })} · {t('who.createdBy', { name: data.createdByName })}
                </span>
              </span>
            </Card>
            <p className="muted">{t('who.body')}</p>
            <div className="list" role="radiogroup" aria-label={t('who.title')}>
              {data.members.map((m) => (
                <label key={m.id} className={`row ${m.taken ? 'dis' : ''}`}>
                  <input
                    type="radio"
                    name="whoami"
                    checked={!isNew && pick === m.id}
                    disabled={m.taken}
                    onChange={() => {
                      setPick(m.id);
                      setIsNew(false);
                    }}
                  />
                  <Avatar name={m.name} color={avatarColor(m.joinOrder)} />
                  <span className="mid">
                    <span className="ttl">{m.name}</span>
                  </span>
                  {m.taken && <span className="cap">{t('who.taken')}</span>}
                </label>
              ))}
            </div>
            {!isNew ? (
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setIsNew(true);
                  setPick(null);
                }}
              >
                <Icon name="plus" />
                {t('who.notListed')}
              </button>
            ) : (
              <Card className="card-pad card-sel">
                <label className="label" htmlFor="who-name" style={{ margin: 0 }}>
                  {t('who.yourName')}
                </label>
                <input
                  id="who-name"
                  className={`input ${dup ? 'err' : ''}`}
                  value={newName}
                  placeholder={t('who.yourNamePh')}
                  autoComplete="given-name"
                  aria-invalid={dup ? true : undefined}
                  aria-describedby={dup ? 'who-dup' : undefined}
                  onChange={(e) => setNewName(e.target.value)}
                />
                {dup && (
                  <p id="who-dup" className="errmsg">
                    <Icon name="alert" size="sm" />
                    {t('reasons.name-taken', { name: dup.name })}
                  </p>
                )}
                <p className="cap">{t('who.newHint')}</p>
                <button type="button" className="linkbtn" onClick={() => setIsNew(false)}>
                  {t('who.backToList')}
                </button>
              </Card>
            )}
          </>
        )}
      </div>
      <div className="bottombar">
        <Button block disabled={!ready} onClick={confirm}>
          {cta}
        </Button>
      </div>
    </main>
  );
}
