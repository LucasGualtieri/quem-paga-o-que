import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { collection, onSnapshot } from 'firebase/firestore';
import type { Payment } from '@qpq/calc';
import { Badge, Icon, Segmented, SkeletonCard, ThemeToggle } from '../components/index.ts';
import { firebase } from '../firebase.ts';
import { toExpenseDoc, useMySplits, useProfile } from '../data/hooks.ts';
import { ProfileAvatar, SplitCover } from './Photos.tsx';
import { hiddenSplits } from '../data/local.ts';
import { balances, myMember, type Money, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { EmptyArt, useBalanceView } from './common.tsx';

/** Seu saldo em cada split, recalculado das despesas e acertos (nunca guardado). */
function useMyNets(splits: SplitDoc[], uid: string | null): Record<string, number> {
  const ids = splits.map((s) => s.id).join(',');
  const [money, setMoney] = useState<Record<string, Money>>({});
  useEffect(() => {
    if (!ids) return;
    const { db } = firebase();
    const offs = ids.split(',').flatMap((id) => [
      onSnapshot(collection(db, 'splits', id, 'expenses'), (s) => setMoney((m) => ({ ...m, [id]: { payments: [], ...m[id], expenses: s.docs.map((d) => toExpenseDoc(d.id, d.data())).filter((e) => !e.deletedAt) } })), () => {}),
      onSnapshot(collection(db, 'splits', id, 'payments'), (s) => setMoney((m) => ({ ...m, [id]: { expenses: [], ...m[id], payments: s.docs.map((d) => d.data() as Payment) } })), () => {}),
    ]);
    return () => offs.forEach((off) => off());
  }, [ids]);
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of splits) {
      const me = uid ? myMember(s, uid) : null;
      out[s.id] = me ? (balances(s, money[s.id] ?? { expenses: [], payments: [] })[me.id] ?? 0) : 0;
    }
    return out;
  }, [splits, money, uid]);
}

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

  const splits = result.status === 'ready' ? result.data.filter((s) => !hidden.has(s.id)) : [];
  const nets = useMyNets(splits, uid);
  const open = splits.filter((s) => s.status === 'open');
  const done = splits.filter((s) => s.status === 'done');
  const shown = filter === 'open' ? open : done;

  let owe = 0;
  let recv = 0;
  for (const s of open) {
    const c = nets[s.id] ?? 0;
    if (c < 0) owe -= c;
    else recv += c;
  }
  const total = recv - owe;
  const loading = result.status === 'loading';

  return (
    <main className="page">
      <header className="hdr hdr-home">
        <div className="hdr-mid">
          {name && <p className="eyebrow">{t('home.hello', { name })}</p>}
          <h1 className="h1">{t('home.mySplits')}</h1>
        </div>
        <ThemeToggle />
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
                <Link key={s.id} to={`/s/${s.id}`} className="home-card">
                  <SplitCover split={s} />
                  <span className="hdr-mid">
                    <span className="sc-name clamp2">{s.name}</span>
                    <span className="sc-meta">
                      <span className={`stdot ${s.status === 'done' ? 'done' : ''}`} aria-hidden="true" />
                      {t('split.people', { count })} · {t(s.status === 'done' ? 'split.done' : 'split.open')}
                    </span>
                  </span>
                  <span className="balwrap">
                    <Badge tone={b.tone} icon={b.icon}>
                      <span className="amt">{b.amount}</span>
                    </Badge>
                    <span className="balcap">{b.caption}</span>
                  </span>
                </Link>
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
