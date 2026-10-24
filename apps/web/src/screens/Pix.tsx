import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizePixKey, pixCopyPaste, type PixKey } from '@qpq/shared';
import { Button, Icon, useToast } from '../components/index.ts';
import { api } from '../data/api.ts';
import type { SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { useOptimisticValue } from '../lib/optimistic.ts';
import { formatCents } from '../lib/money.ts';
import { copyText } from './common.tsx';

/** Como a chave aparece para a pessoa: telefone e CPF/CNPJ formatados. */
export function pixLabel(p: PixKey): string {
  const d = p.key;
  if (p.type === 'phone') return d.replace(/^\+55(\d{2})(\d{4,5})(\d{4})$/, '+55 ($1) $2-$3');
  if (p.type === 'cpf') return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (p.type === 'cnpj') return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return d;
}

/** "Sua chave Pix" em Sua conta (uma por pessoa; convidado também). Salva na hora (otimista). */
export function PixField({ current }: { current: PixKey | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [shown, setShown] = useOptimisticValue<PixKey | null>(current, (v) => api.setPixKey({ key: v?.key ?? null }));
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(!current);
  const [error, setError] = useState(false);

  const save = () => {
    if (!text.trim()) {
      setShown(null);
      setEditing(true);
      return;
    }
    const pix = normalizePixKey(text);
    if (!pix) {
      setError(true);
      return;
    }
    setError(false);
    setShown(pix);
    setEditing(false);
    setText('');
    toast.show({ text: t('pix.saved') });
  };

  return (
    <div className="card card-pad" style={{ gap: 10 }}>
      <div>
        <p className="ttl">{t('pix.title')}</p>
        <p className="cap">{t('pix.why')}</p>
      </div>
      {shown && !editing ? (
        <div className="pix-current">
          <span className="mid">
            <span className="ttl amt">{pixLabel(shown)}</span>
            <span className="cap">{t(`pix.types.${shown.type}`)}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {t('pix.change')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShown(null)}>
            {t('pix.remove')}
          </Button>
        </div>
      ) : (
        <div className="field">
          <label className="label" htmlFor="pix-key">
            {t('pix.label')}
          </label>
          <div className="pix-edit">
            <input
              id="pix-key"
              className={`input ${error ? 'err' : ''}`}
              value={text}
              autoComplete="off"
              inputMode="text"
              placeholder={t('pix.placeholder')}
              aria-invalid={error}
              onChange={(e) => {
                setText(e.target.value);
                setError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <Button size="sm" onClick={save} disabled={!text.trim()}>
              {t('pix.save')}
            </Button>
          </div>
          {error && (
            <p className="errmsg" role="alert">
              <Icon name="alert" size="sm" />
              {t('pix.invalid')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "Copiar Pix": o código copia e cola com o valor, para colar no app do banco. Some sem chave. */
export function CopyPixButton({ split, to, amount }: { split: SplitDoc; to: string; amount: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const toast = useToast();
  const member = split.members[to];
  if (!member?.pix || amount <= 0) return null;
  const copy = async () => {
    const code = pixCopyPaste({ key: member.pix!.key, name: member.name, amount });
    const ok = await copyText(code);
    toast.show(ok ? { text: t('pix.copied', { amount: formatCents(amount, lang), name: member.name }) } : { kind: 'error', text: t('pix.copyFailed') });
  };
  return (
    <Button size="sm" variant="secondary" icon={<Icon name="pix" size="sm" />} onClick={() => void copy()}>
      {t('pix.copy')}
    </Button>
  );
}
