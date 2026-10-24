import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { inviteLink } from '@qpq/shared';
import { Button, Icon, Sheet, SkeletonCard, useToast, type IconName } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { useMoney, useSplit } from '../data/hooks.ts';
import { hideSplit, pendingJoins } from '../data/local.ts';
import { adminHandover, applyPatches, leaveBlock, membersInOrder, myMember, type ExpenseDoc, type Member, type MemberPatch, type Money, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { useSession } from '../data/session.ts';
import { useOptimisticAction } from '../lib/optimistic.ts';
import { setTheme, useTheme } from '../theme/theme.ts';
import { useLang } from '../i18n/index.ts';
import { dayMonth } from '../lib/dates.ts';
import { DeleteSplitSheet, FinalizeSheet } from './FinalizeSheet.tsx';
import { SplitGone } from './SplitGone.tsx';
import { appBase, copyText, useWho } from './common.tsx';
import { MyViewTab } from './MyViewTab.tsx';
import { usePayFlow } from './PaySheet.tsx';
import { Bell } from './Notifications.tsx';
import { SplitCover } from './Photos.tsx';
import { PeopleTab, type PeopleAction } from './PeopleTab.tsx';
import { TxTab } from './TxTab.tsx';
import { useReasonText } from './reasons.ts';

const TABS: Array<{ key: string; path: string; icon: IconName; label: string }> = [
  { key: 'tx', path: '', icon: 'receipt', label: 'split.tabs.tx' },
  { key: 'eu', path: '/eu', icon: 'user', label: 'split.tabs.me' },
  { key: 'pessoas', path: '/pessoas', icon: 'people', label: 'split.tabs.ppl' },
];

type Patch = { key: number; patch: MemberPatch[]; confirmed: boolean };

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
          setPatches((ps) => [...ps, { key, patch: Array.isArray(patch) ? patch : [patch], confirmed: false }]);
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

  return [split ? applyPatches(split, patches.flatMap((p) => p.patch)) : null, act];
}

/** Finalizar/Reabrir otimista: o status muda na hora; o snapshot do servidor vence quando chega. */
function useStatus(split: SplitDoc | null): [SplitDoc | null, (status: 'open' | 'done') => () => void] {
  const [override, setOverride] = useState<{ status: 'open' | 'done'; doneAt: Date | null } | null>(null);
  useEffect(() => {
    if (override && split?.status === override.status) setOverride(null);
  }, [split, override]);
  const set = useCallback((status: 'open' | 'done') => {
    setOverride({ status, doneAt: status === 'done' ? new Date() : null });
    return () => setOverride(null);
  }, []);
  return [split && override ? { ...split, ...override } : split, set];
}

/** Minha visão, com as folhas de pagamento e de comprovante. */
function MoneyTab({ split, me, expenses, payments }: { split: SplitDoc; me: Member; expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }) {
  const who = useWho(split, me);
  const { flow, sheets } = usePayFlow(split, me, who);
  return (
    <>
      <MyViewTab split={split} me={me} expenses={expenses} payments={payments} flow={flow} />
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
  const lang = useLang();
  const { id = '', tab = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const theme = useTheme();
  const reasonText = useReasonText();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const pending = pendingJoins.use().get(id);
  const result = useSplit(id, pending ? null : uid);
  const [patched, act] = usePatches(result.status === 'ready' ? result.data : null);
  const [view, setStatus] = useStatus(patched);
  const money = useMoney(id, result.status === 'ready');
  const added = (useLocation().state as { added?: string } | null)?.added ?? null;
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const run = useOptimisticAction();

  const current = TABS.find((x) => x.path === (tab ? `/${tab}` : '')) ?? TABS[0]!;

  // Split apagado, link errado ou de quem não está nele: explica em vez de só voltar ao início.
  if (result.status === 'denied' && !pending) return <SplitGone splitId={id} />;
  // A aba Saldo virou parte da Minha visão (links antigos e avisos já lidos).
  if (tab === 'saldo') return <Navigate to={`/s/${id}/eu`} replace />;

  const me = view && uid ? myMember(view, uid) : null;
  if (view && uid && !me && !pending) return <Navigate to="/" replace />;

  const count = view ? membersInOrder(view).length : 0;
  const block = view && me ? leaveBlock(view, money, me.id) : null;
  // Último admin saindo: avisa para quem o papel vai (decisão 4, revista).
  const handover = view && me ? adminHandover(view, me.id) : null;
  const isOpen = view?.status !== 'done';
  const isAdmin = !!me?.admin;

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

  /** Finalizar ou reabrir (só admin): muda na hora; volta com aviso se o servidor recusar. */
  const changeStatus = (status: 'open' | 'done') => {
    setMenu(false);
    setFinalizing(false);
    void run({
      apply: () => {
        const undo = setStatus(status);
        if (status === 'done') void navigate(`/s/${id}/eu`, { replace: true });
        return undo;
      },
      commit: async () => {
        await (status === 'done' ? api.finalizeSplit({ splitId: id }) : api.reopenSplit({ splitId: id }));
        toast.show({ text: status === 'done' ? t('fin.done') : t('fin.reopened') });
      },
      errorText: (e) => reasonText(detailsOf(e)),
    });
  };

  /** Excluir o split (só admin): some na hora; volta com aviso se o servidor recusar. */
  const destroy = () => {
    if (!view) return;
    setDeleting(false);
    const name = view.name;
    void run({
      apply: () => {
        hideSplit(id, true);
        void navigate('/', { replace: true });
        return () => hideSplit(id, false);
      },
      commit: async () => {
        await api.deleteSplit({ splitId: id });
        toast.show({ text: t('del.done', { name }) });
      },
      errorText: (e) => reasonText(detailsOf(e)),
    });
  };

  const menuItems = (
    <>
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
      <Link to="/conta" className="mi" role="menuitem" onClick={() => setMenu(false)}>
        <Icon name="user" />
        {t('account.title')}
      </Link>
      {/* "Finalizar" aparece desabilitado para membro (spec 04). */}
      {isOpen ? (
        <button
          type="button"
          className="mi"
          role="menuitem"
          disabled={!isAdmin}
          onClick={() => {
            setMenu(false);
            setFinalizing(true);
          }}
        >
          <Icon name="flag" />
          {t('fin.menu')}
          {!isAdmin && <span className="cap">{t('fin.adminOnly')}</span>}
        </button>
      ) : (
        <button type="button" className="mi" role="menuitem" disabled={!isAdmin} onClick={() => changeStatus('open')}>
          <Icon name="reopen" />
          {t('fin.reopen')}
          {!isAdmin && <span className="cap">{t('fin.adminOnly')}</span>}
        </button>
      )}
      <button
        type="button"
        className="mi danger"
        role="menuitem"
        disabled={!isAdmin}
        onClick={() => {
          setMenu(false);
          setDeleting(true);
        }}
      >
        <Icon name="trash" />
        {t('del.menu')}
        {!isAdmin && <span className="cap">{t('fin.adminOnly')}</span>}
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
    </>
  );

  const menuButton = (
    <div className="menu-anchor">
      <button type="button" className="iconbtn" aria-label={t('common.moreOptions')} aria-expanded={menu} disabled={!view} onClick={() => setMenu(!menu)}>
        <Icon name="dots" />
      </button>
      {menu && (
        <>
          <button type="button" className="menuscrim" aria-label={t('common.close')} onClick={() => setMenu(false)} />
          <div className="menu" role="menu">
            {menuItems}
          </div>
        </>
      )}
    </div>
  );

  const doneBanner = view && !isOpen && (
    <div className="banner banner-done" role="status">
      <Icon name="flag" />
      <span style={{ flex: 1 }}>{t('fin.banner', { date: view.doneAt ? dayMonth(view.doneAt, lang) : '' })}</span>
      {isAdmin && (
        <Button size="sm" variant="secondary" onClick={() => changeStatus('open')}>
          {t('fin.reopen')}
        </Button>
      )}
    </div>
  );

  const goAdd = () => void navigate(`/s/${id}/despesa/nova`);
  const txTab = view && me && <TxTab split={view} me={me} expenses={money.expenses} loaded={money.loaded} canAdd={isOpen} onAdd={goAdd} lastAdded={added} />;
  const tabBody =
    !view || !me ? (
      <SplitSkeleton />
    ) : current.key === 'pessoas' ? (
      <PeopleTab split={view} money={money} me={me} act={act} />
    ) : current.key === 'tx' ? (
      txTab
    ) : (
      <MoneyTab split={view} me={me} expenses={money.expenses} payments={money.payments} />
    );

  const sheets = (
    <>
      <Sheet open={leaving} title={t('leave.title', { name: view?.name ?? '' })} onClose={() => setLeaving(false)}>
        {block ? (
          <div className="alert" role="alert">
            <Icon name="alert" size="sm" />
            <span>{t('blocks.leaveBalance')}</span>
          </div>
        ) : (
          <>
            <p className="muted">{t('leave.body')}</p>
            {handover && (
              <div className="info">
                <Icon name="shield" />
                <span>{handover.heir ? t('handover.leaveHeir', { name: handover.heir.name }) : t('handover.leaveNext')}</span>
              </div>
            )}
          </>
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
      {view && me && <FinalizeSplitSheet open={finalizing} split={view} me={me} money={money} onClose={() => setFinalizing(false)} onConfirm={() => changeStatus('done')} />}
      {view && me && <DeleteSheet open={deleting} split={view} me={me} money={money} onClose={() => setDeleting(false)} onConfirm={destroy} />}
    </>
  );

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
              {t('split.people', { count })} · {t(isOpen ? 'split.open' : 'split.done')}
            </p>
          )}
        </div>
        <Bell />
        {menuButton}
      </header>
      {doneBanner}

      {tabBody}

      {view && me && current.key === 'tx' && isOpen && money.expenses.length > 0 && (
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
      {sheets}
    </main>
  );
}

/** A folha de Finalizar com os nomes como a pessoa prefere ("Você" ou o nome). */
function FinalizeSplitSheet({ open, split, me, money, onClose, onConfirm }: { open: boolean; split: SplitDoc; me: Member; money: Money; onClose: () => void; onConfirm: () => void }) {
  const who = useWho(split, me);
  return <FinalizeSheet open={open} split={split} money={money} who={who} onClose={onClose} onConfirm={onConfirm} />;
}

function DeleteSheet({ open, split, me, money, onClose, onConfirm }: { open: boolean; split: SplitDoc; me: Member; money: Money; onClose: () => void; onConfirm: () => void }) {
  const who = useWho(split, me);
  return <DeleteSplitSheet open={open} split={split} money={money} who={who} onClose={onClose} onConfirm={onConfirm} />;
}
