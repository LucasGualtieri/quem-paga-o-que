import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Icon, type IconName } from '../components/index.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';

/** Ilustração dos estados vazios; o "+" amarelo só aparece quando há ação. */
export function EmptyArt({ plus }: { plus?: { label: string; onClick: () => void } }) {
  return (
    <div className="emptyart">
      <div className="ea-card" aria-hidden="true" style={{ left: 8, top: 30, transform: 'rotate(-8deg)' }} />
      <div className="ea-card" aria-hidden="true" style={{ left: 40, top: 12, transform: 'rotate(4deg)' }}>
        <div className="ea-line" style={{ left: 16, top: 22, width: 70 }} />
        <div className="ea-line" style={{ left: 16, top: 42, width: 96 }} />
        <div className="ea-line" style={{ left: 16, top: 62, width: 48 }} />
      </div>
      {plus && (
        <button type="button" className="ea-plus" aria-label={plus.label} onClick={plus.onClick}>
          <Icon name="plus" size="lg" />
        </button>
      )}
    </div>
  );
}

export function BackLink({ to, label, icon = 'back' }: { to: string; label: string; icon?: IconName }) {
  return (
    <Link to={to} className="iconbtn" aria-label={label}>
      <Icon name={icon} />
    </Link>
  );
}

export function Header({ left, title, right }: { left?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="hdr">
      {left}
      <h1 className="h3 hdr-mid">{title}</h1>
      {right}
    </header>
  );
}

/** Saldo como no protótipo: valor com sinal (ou "Quitado"), legenda e tom do selo. */
export function useBalanceView() {
  const { t } = useTranslation();
  const lang = useLang();
  return (cents: number) => ({
    tone: cents > 0 ? ('pos' as const) : cents < 0 ? ('neg' as const) : ('zero' as const),
    icon: cents > 0 ? ('in' as const) : cents < 0 ? ('out' as const) : ('check' as const),
    amount: cents === 0 ? t('balance.settled') : formatCents(cents, lang, { signed: true }),
    caption: cents > 0 ? t('balance.toReceive') : cents < 0 ? t('balance.youOwe') : t('balance.allSquare'),
  });
}

/** Copia o texto e avisa; devolve se deu certo. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function appBase(): string {
  return location.origin + location.pathname;
}
