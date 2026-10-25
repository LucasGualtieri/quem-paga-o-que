import { useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Badge, Icon, Segmented, Sheet, SkeletonCard, ThemeToggle } from '../components/index.ts';
import { useMoney, useMySplits, useProfile } from '../data/hooks.ts';
import { myMember, type SplitDoc } from '../data/model.ts';
import { useSplitEdits, withSplitEdits } from '../data/splitEdits.ts';
import { totalsOf, useMyNets } from '../data/nets.ts';
import { Bell } from './Notifications.tsx';
import { ProfileAvatar, SplitCover } from './Photos.tsx';
import { hiddenSplits } from '../data/local.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { dayMonth } from '../lib/dates.ts';
import { formatCents } from '../lib/money.ts';
import { EmptyArt, useBalanceView } from './common.tsx';
import { SplitMenuItem, useSplitActions } from './SplitActions.tsx';

export default function Home() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const result = useMySplits(uid);
  const profile = useProfile(uid);
  const name = profile.status === 'ready' ? profile.data.displayName : '';
  const photoPath = profile.status === 'ready' ? profile.data.photoPath : null;
  const hidden = hiddenSplits.use();
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const view = useBalanceView();

  const edits = useSplitEdits();
  const splits = result.status === 'ready' ? result.data.filter((s) => !hidden.has(s.id)).map((s) => withSplitEdits(s, edits)) : [];
  // Ações do split (⋯ ou toque longo no cartão): Editar, Convidar, Finalizar, Sair, Excluir.
  // `n`: abrir de novo o mesmo split reabre a folha.
  const [acting, setActing] = useState<{ id: string; n: number } | null>(null);
  const actingSplit = splits.find((s) => s.id === acting?.id) ?? null;
  const act = (id: string) => setActing((a) => ({ id, n: (a?.n ?? 0) + 1 }));
  const press = useLongPress(act);
  const nets = useMyNets(splits, uid);
  const open = splits.filter((s) => s.status === 'open');
  const done = splits.filter((s) => s.status === 'done');
  const shown = filter === 'open' ? open : done;

  const { owe, recv, total } = totalsOf(open, nets);
  const loading = result.status === 'loading';

  return (
    <main className="page">
      <header className="hdr hdr-home">
        <div className="hdr-mid">
          {name && <p className="eyebrow">{t('home.hello', { name })}</p>}
          <h1 className="h1">{t('home.mySplits')}</h1>
        </div>
        <ThemeToggle />
        <Bell />
        <Link to="/conta" className="avbtn" aria-label={t('account.title')}>
          <ProfileAvatar name={name} photoPath={photoPath} size="lg" />
        </Link>
      </header>
      {session.status === 'ready' && session.isAnonymous && (
        <div className="banner" role="status">
          <Icon name="user" />
          <span style={{ flex: 1 }}>{t('home.guestBanner')}</span>
          <Link to="/salvar" className="btn btn-p btn-sm">
            {t('account.saveAcc')}
          </Link>
        </div>
      )}

      <div className="content">
        {loading && (
          <div className="sk-stack" aria-busy="true" aria-label={t('common.loading')}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && splits.length === 0 && (
          <div className="empty">
            <EmptyArt plus={{ label: t('home.newSplit'), onClick: () => void navigate('/novo') }} />
            <h2 className="h2">{t('home.emptyTitle')}</h2>
            <p className="muted">{t('home.emptyBody')}</p>
          </div>
        )}

        {!loading && splits.length > 0 && (
          <>
            <div className="card overall">
              <p className="cap">{t('home.overall')}</p>
              <div className="bigbal">
                <span className={`balico ${view(total).tone}`} aria-hidden="true">
                  <Icon name={view(total).icon} />
                </span>
                <span>
                  <span className={`num ${view(total).tone}`}>{total === 0 ? formatCents(0, lang) : formatCents(total, lang, { signed: true })}</span>
                  <span className="balcap" style={{ display: 'block' }}>
                    {total > 0 ? t('balance.receiveTotal') : total < 0 ? t('balance.oweTotal') : t('balance.allSettled')}
                  </span>
                </span>
              </div>
              <p className="cap">{t('balance.sub', { owe: formatCents(owe, lang), recv: formatCents(recv, lang) })}</p>
            </div>

            <Segmented<'open' | 'done'>
              label={t('home.filter')}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'open', label: `${t('home.tabOpen')} ${open.length}` },
                { value: 'done', label: `${t('home.tabDone')} ${done.length}` },
              ]}
            />

            {shown.map((s) => {
              const b = view(nets[s.id] ?? 0);
              const count = Object.keys(s.members).length;
              return (
                <div key={s.id} className="home-row">
                <Link to={`/s/${s.id}`} className="home-card" {...press(s.id)}>
                  <SplitCover split={s} />
                  <span className="hdr-mid">
                    <span className="sc-name clamp2">{s.name}</span>
                    <span className="sc-meta">
                      <span className={`stdot ${s.status === 'done' ? 'done' : ''}`} aria-hidden="true" />
                      {t('split.people', { count })} · {s.status === 'done' && s.doneAt ? t('home.doneOn', { date: dayMonth(s.doneAt, lang) }) : t(s.status === 'done' ? 'split.done' : 'split.open')}
                    </span>
                  </span>
                  <span className="balwrap">
                    <Badge tone={b.tone} icon={b.icon}>
                      <span className="amt">{b.amount}</span>
                    </Badge>
                    <span className="balcap">{b.caption}</span>
                  </span>
                </Link>
                <button type="button" className="iconbtn home-more" aria-label={t('home.actions', { name: s.name })} onClick={() => act(s.id)}>
                  <Icon name="dots" />
                </button>
                </div>
              );
            })}
            {shown.length === 0 && (
              <div className="empty">
                <p className="muted">{t('home.doneEmpty')}</p>
              </div>
            )}
          </>
        )}
      </div>

      {actingSplit && uid && acting && <HomeSplitActions key={acting.n} split={actingSplit} uid={uid} />}

      <div className="bottombar">
        <Link to="/novo" className="btn btn-p btn-block">
          <Icon name="plus" />
          {t('home.newSplit')}
        </Link>
        <Link to="/entrar" className="btn btn-g btn-block">
          <Icon name="link" />
          {t('home.join')}
        </Link>
      </div>
    </main>
  );
}

/**
 * Toque longo no cartão (celular) abre as ações, como o ⋯; o toque normal continua abrindo o
 * split. No Android o toque longo num link vira "menu de contexto": abre as ações no lugar.
 */
function useLongPress(onLong: (id: string) => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong(id);
      }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      fired.current = true;
      onLong(id);
    },
    onClick: (e: MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        fired.current = false;
      }
    },
  });
}

/** A folha de ações de um split da home, com as mesmas folhas de dentro do split. */
function HomeSplitActions({ split, uid }: { split: SplitDoc; uid: string }) {
  const me = myMember(split, uid);
  return me ? <HomeSplitActionsFor split={split} me={me} /> : null;
}

function HomeSplitActionsFor({ split, me }: { split: SplitDoc; me: NonNullable<ReturnType<typeof myMember>> }) {
  const { t } = useTranslation();
  const money = useMoney(split.id, true, split);
  const a = useSplitActions(split, me, money, false);
  const [open, setOpen] = useState(true);
  return (
    <>
      <Sheet open={open} title={split.name} onClose={() => setOpen(false)}>
        <div className="home-actions-head">
          <SplitCover split={split} size="sm" />
          <span className="cap">{t('split.people', { count: Object.keys(split.members).length })} · {t(split.status === 'done' ? 'split.done' : 'split.open')}</span>
        </div>
        <div className="home-actions" role="menu" aria-label={t('home.actions', { name: split.name })}>
          {a.items.map((x) => (
            <SplitMenuItem
              key={x.key}
              item={x}
              isAdmin={a.isAdmin}
              onClick={() => {
                setOpen(false);
                a.perform(x.key);
              }}
            />
          ))}
        </div>
      </Sheet>
      {a.sheets}
    </>
  );
}
