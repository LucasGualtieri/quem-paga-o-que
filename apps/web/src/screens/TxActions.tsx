import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Sheet, type IconName } from '../components/index.ts';
import type { ExpenseDoc, Member, PaymentDoc, SplitDoc } from '../data/model.ts';
import { payModeOf } from '../data/model.ts';
import { touchesSettled } from '../data/settlements.ts';
import { safeGet, safeSet } from '../lib/storage.ts';
import { hasPayments } from './useExpenseActions.ts';

/** Largura dos botões atrás da linha (Duplicar, Editar, Excluir). */
export const SWIPE_W = 216;
const HINT_KEY = 'qpq.swipeHint';
const HINT_VISITS = 3;

/** Quem pode editar ou excluir a despesa: quem lançou ou admin, com o split aberto (spec 04). */
export function canEditExpense(e: ExpenseDoc, split: SplitDoc, me: Member): boolean {
  return split.status === 'open' && (e.author === me.id || me.admin);
}

/**
 * Pista do deslizar (celular): a primeira linha "espia" as ações, até a pessoa deslizar uma vez
 * ou por no máximo 3 visitas. Com movimento reduzido, vira uma linha de texto.
 */
export function useSwipeHint(active: boolean): { peek: boolean; text: boolean; used: () => void } {
  const [state] = useState(() => {
    if (!active || typeof window === 'undefined' || !window.matchMedia('(hover: none)').matches) return 'off';
    const v = safeGet(HINT_KEY);
    if (v === 'used') return 'off';
    const seen = Number(v ?? 0);
    if (seen >= HINT_VISITS) return 'off';
    safeSet(HINT_KEY, String(seen + 1));
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'text' : 'peek';
  });
  const [done, setDone] = useState(false);
  // A espiada roda uma vez por visita (0,7 s de espera + 1,3 s de animação).
  const [peeked, setPeeked] = useState(false);
  useEffect(() => {
    if (state !== 'peek') return;
    const id = window.setTimeout(() => setPeeked(true), 2200);
    return () => window.clearTimeout(id);
  }, [state]);
  return {
    peek: state === 'peek' && !done && !peeked,
    text: state === 'text' && !done,
    used: () => {
      safeSet(HINT_KEY, 'used');
      setDone(true);
    },
  };
}

interface Gesture {
  x: number;
  y: number;
  base: number;
  dragging: boolean;
  dead: boolean;
}

/**
 * Gestos de uma linha no toque: deslizar para a esquerda mostra as ações; segurar entra na seleção.
 * O rolar vertical continua com o navegador (`touch-action: pan-y`). Com mouse, nada disso.
 * Quando o gesto vira horizontal, o `touchmove` é nosso (preventDefault): sem isso o Chrome do
 * Android trata o deslizar como rolagem com inércia e ignora o toque seguinte (o de parar a inércia).
 */
export function useRowGestures(opts: { open: boolean; enabled: boolean; onOpen: (open: boolean) => void; onLong: () => void }) {
  const g = useRef<Gesture | null>(null);
  const timer = useRef<number | null>(null);
  const swallow = useRef(false);
  const [drag, setDragState] = useState<number | null>(null);
  const dragNow = useRef<number | null>(null);
  const setDrag = (v: number | null) => {
    dragNow.current = v;
    setDragState(v);
  };
  const stopTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);
  // O React registra `touchmove` como passivo; o preventDefault precisa de um ouvinte próprio.
  const unlisten = useRef<(() => void) | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    unlisten.current?.();
    unlisten.current = null;
    if (!el) return;
    const move = (e: TouchEvent) => {
      if (g.current?.dragging && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', move, { passive: false });
    unlisten.current = () => el.removeEventListener('touchmove', move);
  }, []);

  return {
    ref,
    offset: drag ?? (opts.open ? -SWIPE_W : 0),
    dragging: drag !== null,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        g.current = { x: e.clientX, y: e.clientY, base: opts.open ? -SWIPE_W : 0, dragging: false, dead: false };
        swallow.current = false;
        stopTimer();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          if (g.current && !g.current.dragging) {
            g.current.dead = true;
            swallow.current = true;
            opts.onLong();
          }
        }, 500);
      },
      onPointerMove: (e: PointerEvent) => {
        const s = g.current;
        if (!s || s.dead) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.dragging) {
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) stopTimer();
          if (!opts.enabled) return;
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
            s.dragging = true;
            try {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            } catch {
              // O toque já acabou (ou não é um ponteiro de verdade): segue sem capturar.
            }
          } else if (Math.abs(dy) > 8) {
            s.dead = true;
            return;
          } else return;
        }
        setDrag(Math.max(-SWIPE_W - 24, Math.min(0, s.base + dx)));
      },
      onPointerUp: () => {
        stopTimer();
        const s = g.current;
        g.current = null;
        if (!s?.dragging) return;
        swallow.current = true;
        opts.onOpen((dragNow.current ?? s.base) < -SWIPE_W / 3);
        setDrag(null);
      },
      onPointerCancel: () => {
        stopTimer();
        g.current = null;
        setDrag(null);
      },
      onContextMenu: (e: MouseEvent) => {
        // Android: o toque longo num link abre o menu do navegador; aqui ele entra na seleção.
        if ((e.nativeEvent as globalThis.PointerEvent).pointerType === 'mouse') return;
        e.preventDefault();
      },
    },
    /** Depois de deslizar ou segurar, o toque não abre a despesa. */
    swallowClick: () => {
      const s = swallow.current;
      swallow.current = false;
      return s;
    },
  };
}

export interface RowAction {
  key: 'duplicate' | 'edit' | 'delete' | 'select';
  icon: IconName;
  label: string;
  /** Sem permissão: aparece apagada e, tocada, explica quem pode. */
  locked: string | null;
}

/** As ações de uma despesa, na ordem da linha deslizada (Excluir na ponta). */
export function useRowActions(split: SplitDoc, me: Member) {
  const { t } = useTranslation();
  return (e: ExpenseDoc, withSelect: boolean): RowAction[] => {
    const author = split.members[e.author]?.name ?? '';
    const can = canEditExpense(e, split, me);
    const out: RowAction[] = [
      { key: 'duplicate', icon: 'copy', label: t('expense.tx.duplicate'), locked: null },
      { key: 'edit', icon: 'pencil', label: t('expense.detail.edit'), locked: can ? null : t('expense.tx.lockEdit', { name: author }) },
      { key: 'delete', icon: 'trash', label: t('expense.detail.del'), locked: can ? null : t('expense.tx.lockDel', { name: author }) },
    ];
    if (withSelect) out.push({ key: 'select', icon: 'check', label: t('expense.tx.select'), locked: null });
    return out;
  };
}

/** Menu do "⋯" (computador): as mesmas ações da linha deslizada, mais Selecionar. */
export function RowMenuSheet({ expense, actions, onPick, onClose }: { expense: ExpenseDoc; actions: RowAction[]; onPick: (a: RowAction) => void; onClose: () => void }) {
  return (
    <Sheet open title={expense.name} onClose={onClose}>
      <div className="home-actions" role="menu" aria-label={expense.name}>
        {actions.map((a) => (
          <button key={a.key} type="button" className={`mi ${a.key === 'delete' ? 'danger' : ''}`} role="menuitem" aria-disabled={!!a.locked} onClick={() => onPick(a)}>
            <Icon name={a.icon} />
            {a.label}
            {a.locked && <span className="cap">{a.locked}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Confirmação de excluir uma ou várias despesas. No detalhado, com pagamento marcado, bloqueia o
 * lote todo e diz qual barrou (decisão 7); no simplificado, avisa se mexe em quem já acertou.
 */
export function DeleteSheet({ list, split, payments, onConfirm, onClose }: { list: ExpenseDoc[]; split: SplitDoc; payments: readonly PaymentDoc[]; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const simple = payModeOf(split) === 'simple';
  const blocked = simple ? [] : list.filter(hasPayments);
  const warn = simple && list.some((e) => touchesSettled(e, split, payments));
  const one = list.length === 1 ? list[0]! : null;
  let body: ReactNode;
  if (blocked.length > 0) {
    body = (
      <div className="alert" role="alert">
        <Icon name="alert" size="sm" />
        <span>{one ? t('expense.detail.blocked') : t('expense.tx.blockedMany', { names: blocked.map((e) => `“${e.name}”`).join(', ') })}</span>
      </div>
    );
  } else {
    body = (
      <>
        <p className="muted">{one ? t('expense.detail.delB') : t('expense.tx.delManyB')}</p>
        {warn && (
          <div className="info">
            <Icon name="alert" />
            <span>{t('expense.changesSettled')}</span>
          </div>
        )}
      </>
    );
  }
  return (
    <Sheet open title={one ? t('expense.detail.delT', { name: one.name }) : t('expense.tx.delManyT', { count: list.length })} onClose={onClose}>
      {body}
      <div className="sheet-acts">
        {blocked.length === 0 && (
          <Button block className="btn-danger-solid" onClick={onConfirm}>
            {one ? t('expense.detail.del') : t('expense.tx.delMany', { count: list.length })}
          </Button>
        )}
        <Button variant="ghost" block onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  );
}
