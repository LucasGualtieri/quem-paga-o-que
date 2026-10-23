import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProofInfo } from '@qpq/shared';
import { Icon } from '../components/index.ts';
import { usePhoto } from '../data/files.ts';

/** "Comprovante" em Mais detalhes: foto da despesa (só imagem; guardada por 15 dias, decisão 9). */
export function ReceiptField({ current, value, onChange }: { current: ProofInfo | null; value: File | null | 'keep'; onChange: (v: File | null | 'keep') => void }) {
  const { t } = useTranslation();
  const saved = usePhoto(value === 'keep' ? current?.path : null);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!(value instanceof File)) {
      setLocal(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const expired = value === 'keep' && !!current && !current.path;
  const thumb = local ?? (saved?.status === 'ready' ? saved.url : null);
  const has = value instanceof File || (value === 'keep' && !!current?.path);
  return (
    <div>
      <span className="label">{t('expense.detail.receipt')}</span>
      {expired ? (
        <p className="cap">{t('photo.expired')}</p>
      ) : (
        <>
          <div className="filerow">
            <label className={`filebtn ${has ? 'on' : ''}`}>
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])} />
              {thumb ? <img className="thumb" src={thumb} alt="" /> : <Icon name="camera" />}
              <span>{has ? t('photo.attached') : t('photo.attachReceipt')}</span>
            </label>
            {has && (
              <button type="button" className="iconbtn" aria-label={t('photo.remove')} onClick={() => onChange(null)}>
                <Icon name="x" />
              </button>
            )}
          </div>
          <p className="cap" style={{ marginTop: 6 }}>
            {t('photo.retention')}
          </p>
        </>
      )}
    </div>
  );
}
