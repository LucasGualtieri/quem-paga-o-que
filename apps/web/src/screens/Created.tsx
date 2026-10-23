import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { coverColor, inviteLink } from '@qpq/shared';
import { Button, Cover, Icon, Skeleton, useToast } from '../components/index.ts';
import { useSplit } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { appBase, BackLink, copyText } from './common.tsx';

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

/** "Split está pronto": aparece na hora ao criar (código chega em seguida). */
export function CreatedView({ splitId, name, emoji, code }: { splitId: string | null; name: string; emoji: string; code: string | null }) {
  const { t } = useTranslation();
  const target = splitId ? `/s/${splitId}` : '/';
  return (
    <main className="page">
      <header className="hdr">
        <span className="hdr-mid" />
        <BackLink to={target} label={t('common.close')} icon="x" />
      </header>
      <div className="created">
        <Cover emoji={emoji} color={coverColor(emoji)} size="xl" />
        <h1 className="h2">{t('created.title', { name })}</h1>
        <p className="muted">{t('created.body')}</p>
        <div className="card invite-card">
          <span className="label">{t('created.inviteLink')}</span>
          <InviteBox code={code} splitName={name} />
        </div>
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
  return <CreatedView splitId={id} name={data?.name ?? ''} emoji={data?.emoji ?? '🎆'} code={data?.code ?? null} />;
}
