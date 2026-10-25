import { useTranslation } from 'react-i18next';
import { Avatar, Button, Icon } from '../components/index.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { EntryIconView } from '../screens/EntryIcon.tsx';

/**
 * Prévia do Meu saldo para a Paleta (dados fixos, sem back-end): seu saldo, um cartão "você
 * deve" aberto (com uma parte compensada e um acerto resolvido), um "te deve" e um quitado.
 */
export function MyViewPreview() {
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = (c: number) => formatCents(c, lang);
  const signed = (c: number) => formatCents(c, lang, { signed: true });
  return (
    <div className="cpanel" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="cap" style={{ fontWeight: 700 }}>
          {t('my.yourBal')}
        </p>
        <div className="bigbal">
          <span className="balico neg" aria-hidden="true">
            <Icon name="out" />
          </span>
          <span>
            <span className="num amt neg">{signed(-1000)}</span>
            <span className="balcap" style={{ display: 'block' }}>
              {t('my.owe')}
            </span>
          </span>
        </div>
      </div>
      <div className="pcard">
        <div className="pchead">
          <Avatar name="Beatriz" color={2} />
          <span className="mid">
            <span className="ttl">Beatriz</span>
            <span className="cap">{t('my.cOwe')}</span>
          </span>
          <span className="right">
            <span className="amt strong neg">{fmt(-1000)}</span>
          </span>
          <Icon name="down" size="sm" className="up" />
        </div>
        <div className="pcmain">
          <Button size="sm" variant="secondary" icon={<Icon name="pix" size="sm" />}>
            {t('pix.copy')}
          </Button>
          <Button size="sm" icon={<Icon name="check" size="sm" />}>
            {t('pay.markPaid')}
          </Button>
        </div>
        <div className="pcbody">
          <div className="pcentry">
            <div className="pcline">
              <EntryIconView icon={{ kind: 'icon', name: 'pizza' }} fallback={{ tags: [] }} size="sm" />
              <span className="mid">
                <span className="ttl">Pizza</span>
                <span className="cap">{t('my.eOwe', { name: 'Beatriz' })} · 27/12</span>
              </span>
              <span className="side">
                <span className="amt strong neg">{signed(-3000)}</span>
              </span>
            </div>
          </div>
          <div className="pcentry">
            <div className="pcline">
              <EntryIconView icon={null} fallback={{ tags: ['transport'] }} size="sm" />
              <span className="mid">
                <span className="ttl">Gasolina</span>
                <span className="cap">
                  {t('my.eOwed', { name: 'Beatriz' })} · 28/12 · {t('my.offset')}
                </span>
              </span>
              <span className="side">
                <span className="amt strong zero">{signed(2000)}</span>
              </span>
            </div>
          </div>
          <div className="pcentry done">
            <div className="pcline done">
              <span className="dir zero" aria-hidden="true">
                <Icon name="swap" size="sm" />
              </span>
              <span className="mid">
                <span className="ttl">{t('my.settle')}</span>
                <span className="cap">
                  {t('my.ePaidOut', { name: 'Beatriz' })} · {t('pay.now')}
                  {t('my.withProof')}
                </span>
              </span>
              <span className="side">
                <span className="amt strong">{fmt(500)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="pcard">
        <div className="pchead">
          <Avatar name="Catarina" color={3} />
          <span className="mid">
            <span className="ttl">Catarina</span>
            <span className="cap">{t('my.cOwed')}</span>
          </span>
          <span className="right">
            <span className="amt strong pos">{fmt(8450)}</span>
          </span>
          <Icon name="down" size="sm" />
        </div>
        <div className="pcmain">
          <Button size="sm" variant="secondary" icon={<Icon name="check" size="sm" />}>
            {t('pay.gotIt')}
          </Button>
        </div>
      </div>
      <div className="pcard zero">
        <div className="pchead">
          <Avatar name="Fellipe" color={4} />
          <span className="mid">
            <span className="ttl">Fellipe</span>
            <span className="cap">{t('my.cZero')}</span>
          </span>
          <span className="right">
            <span className="zerotag">
              <Icon name="check" size="sm" />
              {t('balance.settled')}
            </span>
          </span>
          <Icon name="down" size="sm" />
        </div>
      </div>
    </div>
  );
}
