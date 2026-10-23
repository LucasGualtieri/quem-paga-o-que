import { signInWithCustomToken } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { recoveryLink } from '@qpq/shared';
import { Button, Card, Icon, Skeleton, SkeletonCard, useToast } from '../components/index.ts';
import { withGoogle } from '../data/account.ts';
import { api } from '../data/api.ts';
import { useProfile } from '../data/hooks.ts';
import { useSession } from '../data/session.ts';
import { firebase } from '../firebase.ts';
import { useLang } from '../i18n/index.ts';
import { useAuthFlow } from './authFlow.ts';
import { appBase, BackLink, copyText } from './common.tsx';

const NUDGE_KEY = 'qpq.nudgeOff';

/** O lembrete "Salve sua conta" não volta na mesma sessão depois de fechado (spec 03). */
export function nudgeDismissed(): boolean {
  try {
    return sessionStorage.getItem(NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissNudge(): void {
  try {
    sessionStorage.setItem(NUDGE_KEY, '1');
  } catch {
    // Sem armazenamento: o lembrete pode voltar.
  }
}

export function useShortDate() {
  const lang = useLang();
  return (d: Date | null) => (d ? new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'short' }).format(d) : '');
}

/** "Não perca seus splits": link de recuperação + salvar conta (protótipo sRecovery). */
export default function Recovery() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const flow = useAuthFlow();
  const date = useShortDate();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const profile = useProfile(uid);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const created = useRef(false);

  const make = async () => {
    setLink(null);
    const { token } = await api.createRecoveryLink({});
    setLink(recoveryLink(appBase(), token));
  };

  // Na primeira visita, o link já aparece (só o hash fica no servidor; ele não pode ser mostrado de novo depois).
  const active = profile.status === 'ready' && profile.data.recovery.active;
  useEffect(() => {
    if (profile.status !== 'ready' || active || created.current) return;
    created.current = true;
    void make();
  }, [profile.status, active]);

  if (session.status === 'ready' && !session.isAnonymous) return <Navigate to="/conta" replace />;

  const copy = async () => {
    if (!link) return;
    setCopied(true);
    toast.show({ text: (await copyText(link)) ? t('common.linkCopied') : link });
  };
  const send = async () => {
    if (!link) return;
    if (navigator.share) await navigator.share({ title: 'Quem Paga O Quê?', url: link }).catch(() => {});
    else await copy();
  };

  const showLink = link !== null || !active;

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/" label={t('common.back')} />
        <h1 className="h3 hdr-mid">{t('recovery.title')}</h1>
      </header>
      <div className="content" style={{ gap: 16 }}>
        <p className="muted">{t('recovery.body')}</p>
        <Card className="card-pad" style={{ gap: 12 }}>
          <span className="label" style={{ margin: 0 }}>
            {t('recovery.label')}
          </span>
          {showLink ? (
            <>
              <div className="linkbox">
                <span className="trunc amt">{link ?? <Skeleton width="80%" height={14} />}</span>
                <Button size="sm" disabled={!link} onClick={() => void copy()}>
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
              <Button variant="secondary" block disabled={!link} icon={<Icon name="share" />} onClick={() => void send()}>
                {t('recovery.send')}
              </Button>
            </>
          ) : (
            <>
              <p className="cap">{t('recovery.active', { date: date(profile.status === 'ready' ? profile.data.recovery.createdAt : null) })}</p>
              <Button variant="secondary" block onClick={() => void make()}>
                {t('recovery.regenerate')}
              </Button>
              <p className="hint" style={{ margin: 0 }}>
                {t('recovery.regenerateHint')}
              </p>
            </>
          )}
        </Card>
        <div className="alert">
          <Icon name="alert" size="sm" />
          <span>{t('recovery.warn')}</span>
        </div>
        <div className="divider">{t('recovery.or')}</div>
        <Button
          variant="secondary"
          block
          icon={
            <span className="gmark" aria-hidden="true">
              G
            </span>
          }
          onClick={() => void flow(withGoogle)}
        >
          {t('recovery.google')}
        </Button>
        <Link to="/email" className="btn btn-s btn-block">
          <Icon name="mail" />
          {t('recovery.email')}
        </Link>
      </div>
      <div className="bottombar">
        <Button
          block
          onClick={() => {
            dismissNudge();
            toast.show({ text: t('recovery.saved') });
            void navigate(-1);
          }}
        >
          {t('recovery.done')}
        </Button>
      </div>
    </main>
  );
}

/** Abrir o link de recuperação em outro aparelho devolve a identidade, sem senha. */
export function Redeem() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .redeemRecovery({ token })
      .then(({ customToken }) => signInWithCustomToken(firebase().auth, customToken))
      .then(() => {
        if (!alive) return;
        toast.show({ text: t('auth.welcomeBack') });
        void navigate('/', { replace: true });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <main className="page">
      <div className="content" style={{ paddingTop: 72 }}>
        {failed ? (
          <>
            <div className="alert" role="alert">
              <Icon name="alert" size="sm" />
              <span>{t('recovery.invalid')}</span>
            </div>
            <Link to="/" className="btn btn-p btn-block">
              {t('recovery.goStart')}
            </Link>
          </>
        ) : (
          <div aria-busy="true" aria-label={t('recovery.redeeming')}>
            <SkeletonCard />
          </div>
        )}
      </div>
    </main>
  );
}
