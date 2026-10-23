import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { parseInvite } from '@qpq/shared';
import { Button, Icon } from '../components/index.ts';
import { BackLink } from './common.tsx';

export default function Join() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const go = () => {
    const parsed = parseInvite(code);
    if (!parsed) {
      setError(true);
      return;
    }
    void navigate(`/convite/${parsed}`);
  };

  const paste = async () => {
    try {
      setCode(await navigator.clipboard.readText());
      setError(false);
    } catch {
      // Sem permissão de leitura: a pessoa cola no campo.
    }
  };

  return (
    <main className="page">
      <header className="hdr">
        <BackLink to="/" label={t('common.back')} />
        <h1 className="h3 hdr-mid">{t('join.title')}</h1>
      </header>
      <div className="content" style={{ gap: 18 }}>
        <p className="muted">{t('join.body')}</p>
        <div>
          <label className="label" htmlFor="join-code">
            {t('join.codeLabel')}
          </label>
          <div className="add-row" style={{ marginTop: 0 }}>
            <input
              id="join-code"
              className={`input ${error ? 'err' : ''}`}
              placeholder={t('join.codePh')}
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={error || undefined}
              aria-describedby={error ? 'join-err' : undefined}
              onChange={(e) => {
                setCode(e.target.value);
                setError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
            <Button variant="secondary" size="sm" style={{ minHeight: 52 }} onClick={() => void paste()}>
              {t('join.paste')}
            </Button>
          </div>
          {error && (
            <p id="join-err" className="errmsg" role="alert">
              <Icon name="alert" size="sm" />
              {t('join.codeErr')}
            </p>
          )}
        </div>
        <div className="info">
          <Icon name="alert" />
          <span>{t('join.info')}</span>
        </div>
      </div>
      <div className="bottombar">
        <Button block onClick={go}>
          {t('common.continue')}
        </Button>
      </div>
    </main>
  );
}
