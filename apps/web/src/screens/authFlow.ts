import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useToast } from '../components/index.ts';
import { authCode, type AuthOutcome } from '../data/account.ts';
import { detailsOf } from '../data/api.ts';
import { useReasonText } from './reasons.ts';

const QUIET = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

/** Roda um fluxo de entrar/salvar conta e leva para onde o resultado pede. */
export function useAuthFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const reasonText = useReasonText();

  const handle = (r: AuthOutcome) => {
    if (r.kind === 'choose') {
      void navigate('/juntar', { state: { token: r.token, preview: r.preview } });
      return;
    }
    if (r.kind === 'saved') toast.show({ text: t('auth.saved') });
    if (r.kind === 'merged') toast.show({ text: t('auth.merged') });
    void navigate('/', { replace: true });
  };

  /** `onAuthError` devolve true quando a própria tela mostra o erro do Firebase Auth. */
  return async (run: () => Promise<AuthOutcome>, onAuthError?: (code: string) => boolean): Promise<void> => {
    try {
      handle(await run());
    } catch (error) {
      const code = authCode(error);
      if (QUIET.has(code) || (code && onAuthError?.(code))) return;
      const details = detailsOf(error);
      toast.show({ kind: 'error', text: details ? reasonText(details) : t('email.failed') });
    }
  };
}
