import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast.tsx';

/**
 * Valor com UX otimista (toggles, preferências…): muda na hora e assume sucesso.
 * Se o servidor recusar, volta ao valor do servidor e mostra um toast de erro.
 * Quando o valor do servidor muda (ex.: snapshot do Firestore), ele vence.
 */
export function useOptimisticValue<T>(server: T, save: (value: T) => Promise<unknown>): [T, (value: T) => void] {
  const { t } = useTranslation();
  const toast = useToast();
  const [local, setLocal] = useState<{ value: T } | null>(null);
  const [seenServer, setSeenServer] = useState(server);
  const seq = useRef(0);

  if (!Object.is(server, seenServer)) {
    setSeenServer(server);
    setLocal(null);
  }

  const set = useCallback(
    (value: T) => {
      const id = ++seq.current;
      setLocal({ value });
      save(value).catch(() => {
        // Só a última mudança decide; respostas antigas são ignoradas.
        if (id !== seq.current) return;
        setLocal(null);
        toast.show({ kind: 'error', text: t('errors.saveFailed') });
      });
    },
    [save, toast, t],
  );

  return [local ? local.value : server, set];
}

export interface OptimisticAction {
  /** Aplica a mudança na tela agora; devolve como desfazê-la. */
  apply: () => (() => void) | void;
  /** Grava no servidor. */
  commit: () => Promise<unknown>;
  /** Texto do toast quando o servidor recusa; sem ele, o aviso genérico. */
  errorText?: (error: unknown) => string | undefined;
}

/** Ação otimista genérica (marcar pago, acerto, finalizar…): aplica, grava e só desfaz se o servidor recusar. */
export function useOptimisticAction(): (action: OptimisticAction) => Promise<void> {
  const { t } = useTranslation();
  const toast = useToast();
  return useCallback(
    async ({ apply, commit, errorText }: OptimisticAction) => {
      const rollback = apply();
      try {
        await commit();
      } catch (error) {
        rollback?.();
        toast.show({ kind: 'error', text: errorText?.(error) ?? t('errors.saveFailed') });
      }
    },
    [toast, t],
  );
}
