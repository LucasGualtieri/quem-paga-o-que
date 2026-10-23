import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Avatar, Button, Icon, LangSwitch } from '../components/index.ts';
import { withGoogle } from '../data/account.ts';
import { continueAsGuest } from '../data/session.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { useAuthFlow } from './authFlow.ts';

/** Ilustração neutra do login: 8 partes, R$ 15,00 por parte, sem selo de "pago" (spec 03). */
function Illustration() {
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = (c: number) => formatCents(c, lang);
  const people: Array<[string, 1 | 2 | 3 | 4, number]> = [
    ['L', 1, 3000],
    ['B', 2, 1500],
    ['C', 3, 4500],
    ['F', 4, 3000],
  ];
  return (
    <div className="ill" aria-hidden="true">
      <div className="ill-back" />
      <div className="ill-front">
        <div className="ill-top">
          <span>{t('entry.illTitle')}</span>
          <span className="amt">{fmt(12000)}</span>
        </div>
        <div className="ill-ppl">
          {people.map(([n, c, v]) => (
            <div key={n} className="ill-p">
              <Avatar name={n} color={c} />
              <span className="amt">{fmt(v)}</span>
            </div>
          ))}
        </div>
        <div className="ill-tot">
          <Icon name="check" size="sm" className="pos" />
          <span>{t('entry.illParts')}</span>
          <span className="amt">{t('entry.illPer', { amount: fmt(1500) })}</span>
        </div>
        <div className="prog">
          <span className="bar" />
        </div>
      </div>
      <div className="ill-coin">R$</div>
    </div>
  );
}

/** Tela de entrada: Google, e-mail ou sem conta (conta é opcional). */
export default function Entry() {
  const { t } = useTranslation();
  const flow = useAuthFlow();
  return (
    <main className="page entry">
      <div className="entry-top">
        <LangSwitch />
      </div>
      <Illustration />
      <div className="entry-copy">
        <h1 className="display">
          Quem Paga
          <br />O Quê?
        </h1>
        <p className="muted">{t('entry.tagline')}</p>
      </div>
      <div className="entry-acts">
        <Button
          block
          icon={
            <span className="gmark" aria-hidden="true">
              G
            </span>
          }
          onClick={() => void flow(withGoogle)}
        >
          {t('entry.google')}
        </Button>
        <Link to="/email" className="btn btn-s btn-block">
          {t('entry.signup')}
        </Link>
        <Button variant="ghost" block onClick={() => void continueAsGuest()}>
          {t('entry.guest')}
          <Icon name="chevron" size="sm" />
        </Button>
        <p className="cap">{t('entry.terms')}</p>
      </div>
    </main>
  );
}
