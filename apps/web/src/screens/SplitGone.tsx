import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { Button, Cover, Icon, SkeletonCard } from '../components/index.ts';
import { useDeletedSplit } from '../data/hooks.ts';
import { BackLink } from './common.tsx';

/**
 * Link de um split (ou convite) que não leva mais a lugar nenhum: explica o que aconteceu quando
 * dá para saber (excluído por um admin, ou apagado por ficar 15 dias sem ninguém).
 * `home`: quem estava vendo o split e perdeu o acesso (saiu, foi removido, nome liberado) volta
 * ao início, como antes; a explicação só aparece se o split foi apagado.
 */
export function SplitGone({ splitId, home }: { splitId: string; home?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tomb = useDeletedSplit(splitId);
  const data = tomb.status === 'ready' ? tomb.data : null;
  if (home && tomb.status === 'ready' && !data) return <Navigate to="/" replace />;
  const body = !data ? t('gone.unknown') : data.cause === 'empty' ? t('gone.empty', { name: data.name }) : t('gone.byAdmin', { name: data.name, by: data.byName ?? '' });
  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/" label={t('common.back')} />
        <span className="hdr-mid" />
      </header>
      <div className="content">
        {tomb.status === 'loading' ? (
          <SkeletonCard />
        ) : (
          <div className="empty gone" style={{ paddingTop: 60 }}>
            <span className="balico zero notif-empty" aria-hidden="true">
              {data ? <Cover icon={data.icon} /> : <Icon name="search" size="lg" />}
            </span>
            <h1 className="h2">{data ? t('gone.title') : t('gone.notFound')}</h1>
            <p className="muted" style={{ maxWidth: 320, textWrap: 'pretty' }}>
              {body}
            </p>
            <div className="sheet-acts" style={{ width: '100%', maxWidth: 320 }}>
              <Button block onClick={() => void navigate('/novo')}>
                {t('gone.create')}
              </Button>
              <Button variant="ghost" block onClick={() => void navigate('/', { replace: true })}>
                {t('gone.home')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
