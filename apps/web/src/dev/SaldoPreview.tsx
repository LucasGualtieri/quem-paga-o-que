import { useTranslation } from 'react-i18next';
import { Avatar, Button, Icon } from '../components/index.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';

/**
 * Prévia da aba Saldo para a Paleta (dados fixos, sem back-end): o seu cartão com `--me-soft`,
 * uma dívida, um "a receber", um acerto resolvido e um cartão fechado.
 */
export function SaldoPreview() {
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = (c: number) => formatCents(c, lang, { signed: true });
  return (
    <div className="cpanel" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="cap" style={{ fontWeight: 700 }}>
          {t('sal.yourBal')}
        </p>
        <div className="bigbal">
          <span className="balico neg" aria-hidden="true">
            <Icon name="out" />
          </span>
          <span>
            <span className="num amt neg">{fmt(-9213)}</span>
            <span className="balcap" style={{ display: 'block' }}>
              {t('sal.owe')}
            </span>
          </span>
        </div>
      </div>
      <div className="pcard me">
        <div className="pchead">
          <Avatar name="Lucas" color={1} />
          <span className="mid">
            <span className="ttl">{t('common.you')}</span>
            <span className="cap">{t('sal.owesTo', { count: 1 })}</span>
          </span>
          <span className="right">
            <span className="amt strong neg">{fmt(-9213)}</span>
            <span className="balcap">{t('sal.owes')}</span>
          </span>
        </div>
        <div className="pcbody">
          <div className="pcline">
            <span className="dir neg" aria-hidden="true">
              <Icon name="out" size="sm" />
            </span>
            <Avatar name="Beatriz" color={2} size="sm" />
            <span className="mid">
              <span className="ttl">{t('sal.youOweTo', { name: 'Beatriz' })}</span>
            </span>
            <span className="amt strong neg">{fmt(-23500)}</span>
          </div>
          <div className="pcact">
            <Button size="sm" icon={<Icon name="check" size="sm" />}>
              {t('pay.markPaid')}
            </Button>
          </div>
          <div className="pcline">
            <span className="dir pos" aria-hidden="true">
              <Icon name="in" size="sm" />
            </span>
            <Avatar name="Catarina" color={3} size="sm" />
            <span className="mid">
              <span className="ttl">{t('sal.owesYou', { name: 'Catarina' })}</span>
            </span>
            <span className="amt strong pos">{fmt(8450)}</span>
          </div>
          <div className="pcline done">
            <span className="dir zero" aria-hidden="true">
              <Icon name="check" size="sm" />
            </span>
            <Avatar name="Fellipe" color={4} size="sm" />
            <span className="mid">
              <span className="ttl">{t('sal.paidYou', { name: 'Fellipe' })}</span>
              <span className="cap">
                {t('sal.settledNote', { when: t('pay.now') })}
                {t('sal.withProof')}
              </span>
            </span>
            <span className="amt strong">{formatCents(5837, lang)}</span>
          </div>
        </div>
      </div>
      <div className="pcard">
        <div className="pchead">
          <Avatar name="Beatriz" color={2} />
          <span className="mid">
            <span className="ttl">Beatriz</span>
            <span className="cap">{t('sal.getsFrom', { count: 3 })}</span>
          </span>
          <span className="right">
            <span className="amt strong pos">{fmt(80287)}</span>
            <span className="balcap">{t('sal.gets')}</span>
          </span>
          <Icon name="down" size="sm" />
        </div>
      </div>
    </div>
  );
}
