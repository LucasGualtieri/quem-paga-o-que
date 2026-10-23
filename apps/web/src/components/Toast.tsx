import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx.ts';
import { Icon } from './Icon.tsx';

export const TOAST_MS = 4000;

export interface ToastInput {
  text: string;
  kind?: 'success' | 'error';
  /** Ação inversa; com ela aparece "Desfazer". */
  onUndo?: () => void;
}

interface ToastApi {
  show: (toast: ToastInput) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast precisa de <ToastProvider>');
  return api;
}

/** Pílula discreta com check (ou alerta), cerca de 4 s; um toast por vez. */
export function ToastView({ text, kind = 'success', onUndo }: ToastInput) {
  const { t } = useTranslation();
  return (
    <div className={cx('toast', kind === 'error' && 'toast-err')}>
      <span className="toastck" aria-hidden="true">
        <Icon name={kind === 'error' ? 'alert' : 'check'} />
      </span>
      <span>{text}</span>
      {onUndo && (
        <button type="button" className="toastbtn" onClick={onUndo}>
          {t('common.undo')}
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((input: ToastInput) => {
    clearTimeout(timer.current);
    seq.current += 1;
    setToast({ ...input, id: seq.current });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const undo = toast?.onUndo;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <ToastView
            key={toast.id}
            text={toast.text}
            {...(toast.kind ? { kind: toast.kind } : {})}
            {...(undo
              ? {
                  onUndo: () => {
                    dismiss();
                    undo();
                  },
                }
              : {})}
          />
        )}
      </div>
    </ToastContext.Provider>
  );
}
