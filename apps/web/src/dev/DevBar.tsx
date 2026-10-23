import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge, Icon, LangSwitch, ThemeToggle } from '../components/index.ts';
import { hasOverrides, useOverrides } from './overrides.ts';

export function DevBar({ title, back = true }: { title: string; back?: boolean }) {
  const { t } = useTranslation();
  const overrides = useOverrides();
  return (
    <header className="devbar">
      {back && (
        <Link to="/dev" className="iconbtn" aria-label={t('dev.back')}>
          <Icon name="back" />
        </Link>
      )}
      <h1 className="h2 devbar-title">{title}</h1>
      {hasOverrides(overrides) && (
        <Link to="/dev/paleta" className="devbar-badge">
          <Badge tone="acc">{t('dev.paletteActive')}</Badge>
        </Link>
      )}
      <LangSwitch />
      <ThemeToggle />
    </header>
  );
}
