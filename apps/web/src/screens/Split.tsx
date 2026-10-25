import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Button, Icon, SkeletonCard, useToast, type IconName } from '../components/index.ts';
import { detailsOf } from '../data/api.ts';
import { useMoney, useSplit } from '../data/hooks.ts';
import { pendingJoins } from '../data/local.ts';
import { applyPatches, finalizeSuggestion, membersInOrder, myMember, type ExpenseDoc, type Member, type MemberPatch, type Money, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { useSplitEdits, withSplitEdits } from '../data/splitEdits.ts';
import { useSession } from '../data/session.ts';
import { useOptimisticAction } from '../lib/optimistic.ts';
import { setTheme, useTheme } from '../theme/theme.ts';
import { useLang } from '../i18n/index.ts';
import { dayMonth } from '../lib/dates.ts';
import { SplitGone } from './SplitGone.tsx';
import { useWho } from './common.tsx';
import { MyViewTab } from './MyViewTab.tsx';
import { usePayFlow } from './PaySheet.tsx';
import { Bell } from './Notifications.tsx';
import { SplitCover } from './Photos.tsx';
import { PeopleTab, type PeopleAction } from './PeopleTab.tsx';
import { SplitMenuItem, useSplitActions } from './SplitActions.tsx';
import { TxTab } from './TxTab.tsx';
import { useReasonText } from './reasons.ts';

const TABS: Array<{ key: string; path: string; icon: IconName; label: string }> = [
  { key: 'tx', path: '', icon: 'receipt', label: 'split.tabs.tx' },
  { key: 'saldo', path: '/saldo', icon: 'swap', label: 'split.tabs.me' },
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

/** Meu saldo, com as folhas de pagamento e de comprovante. */
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
  const theme = useTheme();
  const session = useSession();
  const uid = session.status === 'ready' ? session.uid : null;
  const pending = pendingJoins.use().get(id);
  const result = useSplit(id, pending ? null : uid);
  const [patched, act] = usePatches(result.status === 'ready' ? result.data : null);
  const edits = useSplitEdits();
  const view = useMemo(() => (patched ? withSplitEdits(patched, edits) : null), [patched, edits]);
  const money = useMoney(id, result.status === 'ready', view);
  const added = (useLocation().state as { added?: string } | null)?.added ?? null;
  const [menu, setMenu] = useState(false);
  const [, bump] = useState(0);

  // Já mostrou este split: perder o acesso depois volta ao início (salvo se ele foi apagado).
  const seen = useRef<string | null>(null);
  if (result.status === 'ready') seen.current = id;

  const current = TABS.find((x) => x.path === (tab ? `/${tab}` : '')) ?? TABS[0]!;

  // Split apagado, link errado ou de quem não está nele: explica em vez de só voltar ao início.
  if (result.status === 'denied' && !pending) return <SplitGone splitId={id} home={seen.current === id} />;
  // A Minha visão (/eu) virou Meu saldo (/saldo): links antigos e avisos já lidos.
  if (tab === 'eu') return <Navigate to={`/s/${id}/saldo`} replace />;

  const me = view && uid ? myMember(view, uid) : null;
  if (view && uid && !me && !pending) return <Navigate to="/" replace />;

  const count = view ? membersInOrder(view).length : 0;
  // Sugestão de finalizar (só admin), escondida por "Agora não" até o dinheiro mudar de novo.
  const suggestKey = view?.moneyAt ? `qpq.finSuggest.${id}` : null;
  const dismissedSuggestion = suggestKey ? safeGet(suggestKey) === String(view!.moneyAt!.getTime()) : false;
  const suggestion = view && !dismissedSuggestion ? finalizeSuggestion(view, money, Date.now()) : null;
  const dismissSuggestion = () => {
    if (suggestKey && view?.moneyAt) safeSet(suggestKey, String(view.moneyAt.getTime()));
    bump((n) => n + 1);
  };
  const isOpen = view?.status !== 'done';

  /** Cabeçalho, aviso de finalizado e folhas; com o split carregado, as ações (spec 04). */
  const chrome = (a: SplitActions | null) => {
    const config = () => a?.perform('config');
    return (
      <>
        <header className="hdr hdr-split">
          <Link to="/" className="iconbtn" aria-label={t('common.back')}>
            <Icon name="back" />
          </Link>
          {/* Tocar na capa ou no nome abre as Configurações do split (membro vê só leitura). */}
          {view &&
            (a ? (
              <button type="button" className="hdr-edit" aria-label={t('config.title')} onClick={config}>
                <SplitCover split={view} size="sm" />
              </button>
            ) : (
              <SplitCover split={view} size="sm" />
            ))}
          <div className="hdr-mid">
            <h1 className="h3 clamp2">
              {a ? (
                <button type="button" className="hdr-edit-name" onClick={config}>
                  {view?.name ?? ''}
                </button>
              ) : (
                (view?.name ?? '')
              )}
            </h1>
            {view && (
              <p className="cap">
                {t('split.people', { count })} · {t(isOpen ? 'split.open' : 'split.done')}
              </p>
            )}
          </div>
          <Bell />
          <div className="menu-anchor">
            <button type="button" className="iconbtn" aria-label={t('common.moreOptions')} aria-expanded={menu} disabled={!a} onClick={() => setMenu(!menu)}>
              <Icon name="dots" />
            </button>
            {menu && a && (
              <>
                <button type="button" className="menuscrim" aria-label={t('common.close')} onClick={() => setMenu(false)} />
                <div className="menu" role="menu">
                  {a.items.map((x, i) => (
                    <SplitMenuItem
                      key={x.key}
                      item={x}
                      isAdmin={a.isAdmin}
                      onClick={() => {
                        setMenu(false);
                        a.perform(x.key);
                      }}
                      after={
                        // Tema e Sua conta logo depois de Convidar, como antes.
                        a.items[i]?.key === 'invite' && (
                          <>
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
                          </>
                        )
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </header>
        {view && !isOpen && (
          <div className="banner banner-done" role="status">
            <Icon name="flag" />
            <span style={{ flex: 1 }}>{t(view.autoFinalized ? 'fin.bannerAuto' : 'fin.banner', { date: view.doneAt ? dayMonth(view.doneAt, lang) : '' })}</span>
            {a?.isAdmin && (
              <Button size="sm" variant="secondary" onClick={() => a.perform('reopen')}>
                {t('fin.reopen')}
              </Button>
            )}
          </div>
        )}
        {suggestion && a?.isAdmin && (
          // Todo mundo quitou há 24 h: sugere finalizar. "Agora não" só esconde; o prazo não muda.
          <div className="banner fin-suggest" role="status">
            <Icon name="flag" />
            <span className="mid">
              <span className="ttl">{t('fin.suggestT')}</span>
              <span className="cap">
                {suggestion.pending ? `${t('fin.suggestPending')} ` : ''}
                {t('fin.suggestAuto', { date: dayMonth(suggestion.autoAt, lang) })}
              </span>
              <span className="fin-suggest-acts">
                <Button size="sm" onClick={() => a.perform('finalize')}>
                  {t('fin.suggestYes')}
                </Button>
                <Button size="sm" variant="ghost" onClick={dismissSuggestion}>
                  {t('fin.suggestNo')}
                </Button>
              </span>
            </span>
          </div>
        )}
        {a?.sheets}
      </>
    );
  };

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

  return (
    <main className="page">
      {view && me ? (
        <WithSplitActions split={view} me={me} money={money}>
          {chrome}
        </WithSplitActions>
      ) : (
        chrome(null)
      )}

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
    </main>
  );
}

type SplitActions = ReturnType<typeof useSplitActions>;

function WithSplitActions({ split, me, money, children }: { split: SplitDoc; me: Member; money: Money; children: (a: SplitActions) => ReactNode }) {
  return <>{children(useSplitActions(split, me, money, true))}</>;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento (aba anônima): a faixa só some até recarregar.
  }
}
