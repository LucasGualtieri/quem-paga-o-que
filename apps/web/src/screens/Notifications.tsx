import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { Icon, SkeletonCard, type IconName } from '../components/index.ts';
import { useMySplits, useProfile } from '../data/hooks.ts';
import { currencyOf } from '../data/model.ts';
import { bellCount, markAllRead, markRead, useNotifications, viewOf, type NotificationDoc } from '../data/notifications.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { shortDayTime } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { MemberAvatar } from './Photos.tsx';

const BADGE: Record<NotificationDoc['kind'], { icon: IconName; tone: string }> = {
  paid: { icon: 'in', tone: 'pos' },
  settled: { icon: 'in', tone: 'pos' },
  proof: { icon: 'camera', tone: 'acc' },
  disputed: { icon: 'alert', tone: 'neg' },
  splitDeleted: { icon: 'trash', tone: 'neg' },
  autoFinalized: { icon: 'flag', tone: 'acc' },
  pixRequested: { icon: 'pix', tone: 'acc' },
  pixAdded: { icon: 'pix', tone: 'pos' },
};

function useUid(): string | null {
  const session = useSession();
  return session.status === 'ready' ? session.uid : null;
}

/** Sino do cabeçalho (home e split): contagem até "9+"; some com "No app" desligado (spec 07). */
export function Bell() {
  const { t } = useTranslation();
  const uid = useUid();
  const { pathname } = useLocation();
  const profile = useProfile(uid);
  const list = useNotifications(uid);
  if (profile.status === 'ready' && profile.data.prefs.inapp === false) return null;
  const unread = (list ?? []).filter((n) => !n.read).length;
  return (
    <Link to="/notificacoes" state={{ from: pathname }} className="iconbtn bell" aria-label={unread ? t('notif.bellNew', { count: unread }) : t('notif.bell')}>
      <Icon name="bell" />
      {unread > 0 && (
        <span className="bdg" aria-hidden="true">
          {bellCount(unread)}
        </span>
      )}
    </Link>
  );
}

/** Lista de notificações (/notificacoes). Abrir um item marca como lido e leva ao lugar dele. */
export default function Notifications() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const uid = useUid();
  const list = useNotifications(uid);
  const splits = useMySplits(uid);
  const byId = new Map((splits.status === 'ready' ? splits.data : []).map((s) => [s.id, s]));
  const unread = (list ?? []).filter((n) => !n.read);

  const open = (n: NotificationDoc, to: string) => {
    if (!n.read) void markRead(n.id);
    void navigate(to);
  };

  return (
    <main className="page">
      <header className="hdr">
        <Link to={from} className="iconbtn" aria-label={t('common.back')}>
          <Icon name="back" />
        </Link>
        <h1 className="h3 hdr-mid">{t('notif.title')}</h1>
        {unread.length > 0 && (
          <button type="button" className="linkbtn" onClick={() => void markAllRead(unread.map((n) => n.id))}>
            {t('notif.readAll')}
          </button>
        )}
      </header>
      <div className="content" style={{ paddingBottom: 40 }}>
        {list === null ? (
          <SkeletonCard />
        ) : list.length === 0 ? (
          <div className="empty" style={{ paddingTop: 80 }}>
            <span className="balico zero notif-empty" aria-hidden="true">
              <Icon name="bell" size="lg" />
            </span>
            <h2 className="h2">{t('notif.emptyT')}</h2>
            <p className="muted" style={{ maxWidth: 280 }}>
              {t('notif.emptyB')}
            </p>
          </div>
        ) : (
          <div className="list">
            {list.map((n) => {
              const split = byId.get(n.splitId);
              const name = (id: string | null) => (id && split?.members[id]?.name) || '';
              const v = viewOf(n, (k, o) => t(k, o ?? {}), name, (c) => formatCents(c, lang, split ? { currency: currencyOf(split) } : {}));
              const badge = BADGE[n.kind];
              return (
                <button key={n.id} type="button" className={`row nrow ${n.read ? '' : 'unread'}`} onClick={() => open(n, v.to)}>
                  <span className="avsel">
                    <MemberAvatar member={split?.members[n.from]} name={name(n.from) || n.fromName} size="lg" />
                    <span className={`nbadge ${badge.tone}`} aria-hidden="true">
                      <Icon name={badge.icon} />
                    </span>
                  </span>
                  <span className="mid">
                    <span className="ttl">{v.title}</span>
                    <span className="cap">{v.sub}</span>
                    {n.at && (
                      <span className="cap" style={{ fontWeight: 700 }}>
                        {shortDayTime(n.at, lang)}
                      </span>
                    )}
                  </span>
                  {!n.read && <span className="udot" role="img" aria-label={t('notif.unread')} />}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <Link to="/conta" className="linkbtn">
            {t('notif.manage')}
          </Link>
        </div>
      </div>
    </main>
  );
}
