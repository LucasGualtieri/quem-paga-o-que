import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { coverColor, type PreviewMergeResponse } from '@qpq/shared';
import { Avatar, Button, Card, Cover, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { useReasonText } from './reasons.ts';

/** Decisão 5: a conta já existia; onde há dois nomes no mesmo split, a pessoa escolhe qual manter. */
export default function Merge() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const reasonText = useReasonText();
  const state = useLocation().state as { token: string; preview: PreviewMergeResponse } | null;
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!state) return <Navigate to="/" replace />;
  const { token, preview } = state;
  const ready = preview.conflicts.every((c) => keep[c.splitId]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.mergeGuest({ token, keep });
      toast.show({ text: t('auth.merged') });
      void navigate('/', { replace: true });
    } catch (error) {
      toast.show({ kind: 'error', text: reasonText(detailsOf(error)) });
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="hdr">
        <h1 className="h3 hdr-mid" style={{ paddingLeft: 4 }}>
          {t('merge.title')}
        </h1>
      </header>
      <div className="content" style={{ gap: 16 }}>
        <p className="muted">{t('merge.body')}</p>
        {preview.conflicts.map((c) => (
          <Card key={c.splitId} className="card-pad">
            <div className="split-head" style={{ padding: 0 }}>
              <Cover emoji={c.emoji} color={coverColor(c.emoji)} size="sm" />
              <span className="ttl">{c.splitName}</span>
            </div>
            <div className="list" role="radiogroup" aria-label={t('merge.pick', { split: c.splitName })}>
              {[
                { ...c.guest, note: t('merge.fromDevice') },
                { ...c.account, note: t('merge.fromAccount') },
              ].map((o, i) => (
                <label key={o.id} className="row">
                  <input type="radio" name={`keep-${c.splitId}`} checked={keep[c.splitId] === o.id} onChange={() => setKeep({ ...keep, [c.splitId]: o.id })} />
                  <Avatar name={o.name} color={i === 0 ? 2 : 1} />
                  <span className="mid">
                    <span className="ttl">{o.name}</span>
                  </span>
                  <span className="cap">{o.note}</span>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="bottombar">
        <Button block disabled={!ready || busy} onClick={() => void submit()}>
          {t('merge.submit')}
        </Button>
      </div>
    </main>
  );
}
