import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidEmail } from '@qpq/shared';
import { Button, TextField, useToast } from '../components/index.ts';
import { sendPasswordReset, signInWithEmail, signUpWithEmail } from '../data/account.ts';
import { useSession } from '../data/session.ts';
import { useAuthFlow } from './authFlow.ts';
import { BackLink } from './common.tsx';

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'email.invalidEmail',
  'auth/weak-password': 'email.weak',
  'auth/email-already-in-use': 'email.inUse',
  'auth/invalid-credential': 'email.wrong',
  'auth/wrong-password': 'email.wrong',
  'auth/user-not-found': 'email.wrong',
  'auth/too-many-requests': 'email.tooMany',
  'auth/network-request-failed': 'email.network',
};

/** Criar conta ou entrar com e-mail (sem tela no protótipo; segue a Folha de estilo). */
export default function EmailAuth() {
  const { t } = useTranslation();
  const toast = useToast();
  const flow = useAuthFlow();
  const session = useSession();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const signup = mode === 'signup';
  const back = session.status === 'ready' ? '/salvar' : '/';

  const submit = async () => {
    if (!isValidEmail(email)) return setError(t('email.invalidEmail'));
    if (password.length < 6) return setError(t('email.weak'));
    setError(undefined);
    setBusy(true);
    try {
      // Erros do Firebase Auth ficam no formulário; o resto (fusão) o fluxo trata.
      await flow(
        () => (signup ? signUpWithEmail(email, password) : signInWithEmail(email, password)),
        (code) => {
          const key = ERRORS[code];
          if (!key) return false;
          if (code === 'auth/email-already-in-use') setMode('signin');
          setError(t(key));
          return true;
        },
      );
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!isValidEmail(email)) return setError(t('email.invalidEmail'));
    await sendPasswordReset(email).catch(() => {});
    toast.show({ text: t('email.resetSent') });
  };

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to={back} label={t('common.back')} />
        <h1 className="h3 hdr-mid">{signup ? t('email.titleSignup') : t('email.titleSignin')}</h1>
      </header>
      <form
        className="content form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label={t('email.email')} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <TextField
            label={t('email.password')}
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            error={error}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signup && !error && <p className="hint">{t('email.passwordHint')}</p>}
          {!signup && (
            <button type="button" className="linkbtn" onClick={() => void forgot()}>
              {t('email.forgot')}
            </button>
          )}
        </div>
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            setMode(signup ? 'signin' : 'signup');
            setError(undefined);
          }}
        >
          {signup ? t('email.toSignin') : t('email.toSignup')}
        </button>
        <div className="bottombar">
          <Button type="submit" block disabled={busy || !email || !password}>
            {signup ? t('email.submitSignup') : t('email.submitSignin')}
          </Button>
        </div>
      </form>
    </main>
  );
}
