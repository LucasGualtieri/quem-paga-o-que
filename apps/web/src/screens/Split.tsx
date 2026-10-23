import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { inviteLink } from '@qpq/shared';
import { Button, Icon, Sheet, SkeletonCard, useToast, type IconName } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { useMoney, useSplit } from '../data/hooks.ts';
import { hideSplit, pendingJoins } from '../data/local.ts';
import { applyPatches, leaveBlock, membersInOrder, myMember, type ExpenseDoc, type Member, type MemberPatch, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useOptimisticAction } from '../lib/optimistic.ts';
import { setTheme, useTheme } from '../theme/theme.ts';
import { BalanceTab } from './BalanceTab.tsx';
import { appBase, copyText, useWho } from './common.tsx';
import { MyViewTab } from './MyViewTab.tsx';
import { usePayFlow } from './PaySheet.tsx';
import { SplitCover } from './Photos.tsx';
import { PeopleTab, type PeopleAction } from './PeopleTab.tsx';
import { TxTab } from './TxTab.tsx';
import { useReasonText } from './reasons.ts';

const TABS: Array<{ key: string; path: string; icon: IconName; label: string }> = [
  { key: 'tx', path: '', icon: 'receipt', label: 'split.tabs.tx' },
  { key: 'saldo', path: '/saldo', icon: 'swap', label: 'split.tabs.sal' },
  { key: 'eu', path: '/eu', icon: 'user', label: 'split.tabs.me' },
  { key: 'pessoas', path: '/pessoas', icon: 'people', label: 'split.tabs.ppl' },
];

type Patch = { key: number; patch: MemberPatch; confirmed: boolean };

/** Mudanças otimistas em participantes: valem na hora e saem quando o snapshot do servidor chega. */
function usePatches(split: SplitDoc | null): [SplitDoc | null, PeopleAction] {
  const [patches, setPatches] = useState<Patch[]>([]);
  const seq = useRef(0);
  const run = useOptimisticAction();
  const toast = useToast();
  const reasonText = useReasonText();

  useEffect(() => {
    setPatches((ps) => ps.filter((p) => !p.confirmed));
  }, [split]);

  const act = useCallback<PeopleAction>(
    (patch, commit, done) => {
      const key = ++seq.current;
      void run({
        apply: () => {
          setPatches((ps) => [...ps, { key, patch, confirmed: false }]);
          return () => setPatches((ps) => ps.filter((p) => p.key !== key));
        },
        commit: async () => {
          await commit();
          setPatches((ps) => ps.map((p) => (p.key === key ? { ...p, confirmed: true } : p)));
          if (done) toast.show({ text: done });
        },
        errorText: (e) => reasonText(detailsOf(e)),
      });
    },
    [run, toast, reasonText],
  );

  return [split ? applyPatches(split, patches.map((p) => p.patch)) : null, act];
}

/** Saldo e Minha visão, com as folhas de pagamento e de comprovante. */
function MoneyTab({ tab, split, me, expenses, payments }: { tab: 'saldo' | 'eu'; split: SplitDoc; me: Member; expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }) {
  const who = useWho(split, me);
  const { flow, sheets } = usePayFlow(split, me, who);
  return (
    <>
      {tab === 'saldo' ? <BalanceTab split={split} me={me} expenses={expenses} payments={payments} flow={flow} /> : <MyViewTab split={split} me={me} expenses={expenses} payments={payments} flow={flow} />}
      {sheets}
    </>
  );
}

function SplitSkeleton() {
  return (
    <div className="content sk-stack" aria-busy="true">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

export default function Split() {
  const { t } = useTranslation();
  const { id = '', tab = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const theme = useTheme();
  const reasonText = useReasonText();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const pending = pendingJoins.use().get(id);
  const result = useSplit(id, pending ? null : uid);
  const [view, act] = usePatches(result.status === 'ready' ? result.data : null);
  const money = useMoney(id, result.status === 'ready');
  const added = (useLocation().state as { added?: string } | null)?.added ?? null;
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const run = useOptimisticAction();

  const current = TABS.find((x) => x.path === (tab ? `/${tab}` : '')) ?? TABS[0]!;

  if (result.status === 'denied' && !pending) return <Navigate to="/" replace />;

  const me = view && uid ? myMember(view, uid) : null;
  if (view && uid && !me && !pending) return <Navigate to="/" replace />;

  const count = view ? membersInOrder(view).length : 0;
  const block = view && me ? leaveBlock(view, money, me.id) : null;

  const invite = async () => {
    setMenu(false);
    if (!view) return;
    if (me?.admin) {
      void navigate(`/s/${id}/pessoas`);
      return;
    }
    const link = inviteLink(appBase(), view.code);
    toast.show({ text: (await copyText(link)) ? t('common.linkCopied') : link });
  };

  const leave = () => {
    if (!view) return;
    setLeaving(false);
    const name = view.name;
    // Otimista: volta para a home sem o split; se o servidor recusar, ele reaparece.
    void run({
      apply: () => {
        hideSplit(id, true);
        void navigate('/', { replace: true });
        return () => hideSplit(id, false);
      },
      commit: async () => {
        await api.leaveSplit({ splitId: id });
        toast.show({ text: t('leave.left', { name }) });
      },
      errorText: (e) => reasonText(detailsOf(e)),
    });
  };

  return (
    <main className="page">
      <header className="hdr hdr-split">
        <Link to="/" className="iconbtn" aria-label={t('common.back')}>
          <Icon name="back" />
        </Link>
        {view && <SplitCover split={view} size="sm" />}
        <div className="hdr-mid">
          <h1 className="h3 clamp2">{view?.name ?? ''}</h1>
          {view && (
            <p className="cap">
              {t('split.people', { count })} · {t(view.status === 'done' ? 'split.done' : 'split.open')}
            </p>
          )}
        </div>
        <div className="menu-anchor">
          <button type="button" className="iconbtn" aria-label={t('common.moreOptions')} aria-expanded={menu} disabled={!view} onClick={() => setMenu(!menu)}>
            <Icon name="dots" />
          </button>
          {menu && (
            <>
              <button type="button" className="menuscrim" aria-label={t('common.close')} onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <button type="button" className="mi" role="menuitem" onClick={() => void invite()}>
                  <Icon name="link" />
                  {t('menu.invite')}
                </button>
                <button
                  type="button"
                  className="mi"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setTheme(theme === 'light' ? 'dark' : 'light');
                  }}
                >
                  <Icon name="moon" />
                  {t('menu.theme')}
                </button>
                <button
                  type="button"
                  className="mi danger"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setLeaving(true);
                  }}
                >
                  <Icon name="leave" />
                  {t('menu.leave')}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {!view || !me ? (
        <SplitSkeleton />
      ) : current.key === 'pessoas' ? (
        <PeopleTab split={view} money={money} me={me} act={act} />
      ) : current.key === 'tx' ? (
        <TxTab split={view} me={me} expenses={money.expenses} loaded={money.loaded} canAdd={view.status === 'open'} onAdd={() => void navigate(`/s/${id}/despesa/nova`)} lastAdded={added} />
      ) : (
        <MoneyTab tab={current.key === 'saldo' ? 'saldo' : 'eu'} split={view} me={me} expenses={money.expenses} payments={money.payments} />
      )}

      {view && me && current.key === 'tx' && view.status === 'open' && money.expenses.length > 0 && (
        <Link to={`/s/${id}/despesa/nova`} className="fab" aria-label={t('expense.tx.add')}>
          <Icon name="plus" size="lg" />
        </Link>
      )}

      <nav className="tabbar" aria-label={t('split.tabs.nav')}>
        {TABS.map((x) => (
          <Link key={x.key} to={`/s/${id}${x.path}`} replace className={`tab ${x === current ? 'on' : ''}`} aria-current={x === current ? 'page' : undefined}>
            <span className="pill" aria-hidden="true">
              <Icon name={x.icon} />
            </span>
            <span>{t(x.label)}</span>
            {x.key === 'pessoas' && me && !me.admin && (
              <span className="lk" aria-label={t('split.tabs.adminOnly')}>
                <Icon name="lock" />
              </span>
            )}
          </Link>
        ))}
      </nav>

      <Sheet open={leaving} title={t('leave.title', { name: view?.name ?? '' })} onClose={() => setLeaving(false)}>
        {block ? (
          <div className="alert" role="alert">
            <Icon name="alert" size="sm" />
            <span>{block.reason === 'last-admin' ? t('blocks.lastAdmin') : t('blocks.leaveBalance')}</span>
          </div>
        ) : (
          <p className="muted">{t('leave.body')}</p>
        )}
        <div className="sheet-acts">
          {!block && (
            <Button variant="danger" block onClick={leave}>
              {t('leave.confirm')}
            </Button>
          )}
          <Button variant="ghost" block onClick={() => setLeaving(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
