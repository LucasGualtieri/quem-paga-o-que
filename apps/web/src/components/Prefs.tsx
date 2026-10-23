import { useTranslation } from 'react-i18next';
import { setLang, useLang, type Lang } from '../i18n/index.ts';
import { setTheme, useTheme } from '../theme/theme.ts';
import { Icon } from './Icon.tsx';
import { Segmented } from './Segmented.tsx';

/** Botão de tema (fica ao lado do sino no cabeçalho). */
export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      className="iconbtn"
      aria-label={t('prefs.toggleTheme', { next: t(next === 'dark' ? 'prefs.themeDark' : 'prefs.themeLight').toLocaleLowerCase() })}
      onClick={() => setTheme(next)}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} />
    </button>
  );
}

/** Troca PT/EN (login e home). */
export function LangSwitch() {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Segmented<Lang>
      className="langseg"
      label={t('prefs.language')}
      value={lang}
      onChange={(l) => void setLang(l)}
      options={[
        { value: 'pt-BR', label: 'PT' },
        { value: 'en', label: 'EN' },
      ]}
    />
  );
}
