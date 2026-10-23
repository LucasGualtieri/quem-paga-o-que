import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { coverColor, inviteLink } from '@qpq/shared';
import { Button, Cover, Icon, Skeleton, useToast } from '../components/index.ts';
import { withGoogle } from '../data/account.ts';
import { useSplit } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { useAuthFlow } from './authFlow.ts';
import { appBase, BackLink, copyText } from './common.tsx';
import { dismissNudge, nudgeDismissed } from './Recovery.tsx';
import { SplitCover } from './Photos.tsx';

/** Link de convite com Copiar; sem código ainda, mostra o carregando. */
export function InviteBox({ code, splitName }: { code: string | null; splitName: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const link = code ? inviteLink(appBase(), code) : '';

  const copy = async () => {
    if (!code) return;
    setCopied(true);
    toast.show({ text: (await copyText(link)) ? t('common.linkCopied') : link });
  };
  const share = async () => {
    if (!code) return;
    if (navigator.share) {
      await navigator.share({ title: splitName, url: link }).catch(() => {});
      return;
    }
    await copy();
  };

  return (
    <>
      <div className="linkbox">
        <span className="trunc">{code ? link : <Skeleton width="80%" height={14} />}</span>
        <Button size="sm" disabled={!code} onClick={() => void copy()}>
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <div className="code-row">
        <span className="cap">
          {t('created.code')}: <span className="amt">{code ?? '···-···'}</span>
        </span>
        <button type="button" className="linkbtn" disabled={!code} onClick={() => void share()}>
          <Icon name="share" />
          {t('common.share')}
        </button>
      </div>
    </>
  );
}

/** Convidado que acabou de criar um split: "Salve sua conta…" (spec 03). Fechado, não volta na sessão. */
function SaveNudge() {
  const { t } = useTranslation();
  const session = useSession();
  const flow = useAuthFlow();
  const [hidden, setHidden] = useState(nudgeDismissed);
  if (hidden || session.status !== 'ready' || !session.isAnonymous) return null;
  return (
    <div className="card nudge">
      <div className="nudge-head">
        <span className="balico acc" aria-hidden="true">
          <Icon name="shield" />
        </span>
        <div>
          <p className="h4">{t('nudge.title')}</p>
          <p className="cap" style={{ marginTop: 3 }}>
            {t('nudge.body')}
          </p>
        </div>
      </div>
      <div className="nudge-acts">
        <Button
          size="sm"
          icon={
            <span className="gmark sm" aria-hidden="true">
              G
            </span>
          }
          onClick={() => void flow(withGoogle)}
        >
          {t('nudge.google')}
        </Button>
        <Link to="/salvar" className="btn btn-s btn-sm">
          {t('nudge.recovery')}
        </Link>
      </div>
      <button
        type="button"
        className="linkbtn muted-link"
        onClick={() => {
          dismissNudge();
          setHidden(true);
        }}
      >
        {t('nudge.notNow')}
      </button>
    </div>
  );
}

/** "Split está pronto": aparece na hora ao criar (código chega em seguida). */
export function CreatedView({ splitId, name, emoji, code, photo = null, previewUrl = null }: { splitId: string | null; name: string; emoji: string; code: string | null; photo?: string | null; previewUrl?: string | null }) {
  const { t } = useTranslation();
  const target = splitId ? `/s/${splitId}` : '/';
  return (
    <main className="page">
      <header className="hdr">
        <span className="hdr-mid" />
        <BackLink to={target} label={t('common.close')} icon="x" />
      </header>
      <div className="created">
        {previewUrl ? <Cover emoji={emoji} color={coverColor(emoji)} size="xl" src={previewUrl} /> : <SplitCover split={{ id: splitId ?? '', emoji, photo }} size="xl" />}
        <h1 className="h2">{t('created.title', { name })}</h1>
        <p className="muted">{t('created.body')}</p>
        <div className="card invite-card">
          <span className="label">{t('created.inviteLink')}</span>
          <InviteBox code={code} splitName={name} />
        </div>
        <SaveNudge />
      </div>
      <div className="bottombar">
        <Link to={target} className="btn btn-p btn-block" aria-disabled={!splitId}>
          {t('created.goSplit')}
        </Link>
      </div>
    </main>
  );
}

export default function Created() {
  const { id = '' } = useParams();
  const session = useSession();
  const split = useSplit(id, session.status === 'ready' ? session.uid : null);
  const data = split.status === 'ready' ? split.data : null;
  return <CreatedView splitId={id} name={data?.name ?? ''} emoji={data?.emoji ?? '🎆'} code={data?.code ?? null} photo={data?.photo ?? null} />;
}
