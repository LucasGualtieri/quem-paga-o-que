import { useTranslation } from 'react-i18next';
import { CURRENCIES, type Currency } from '@qpq/shared';
import { useLang } from '../i18n/index.ts';
import { currencySymbol } from '../lib/money.ts';

/** "R$ · Real brasileiro (BRL)": símbolo e nome da moeda no idioma da tela. */
function currencyLabel(c: Currency, lang: 'pt-BR' | 'en'): string {
  let name: string = c;
  try {
    name = new Intl.DisplayNames([lang === 'en' ? 'en-US' : 'pt-BR'], { type: 'currency' }).of(c) ?? c;
  } catch {
    // Navegador sem Intl.DisplayNames: fica a sigla.
  }
  const cap = name.charAt(0).toLocaleUpperCase() + name.slice(1);
  return `${currencySymbol(c, lang)} · ${cap} (${c})`;
}

/** Seletor de moeda do split (spec 09): na criação e nas Configurações. */
export function CurrencyPicker({ id, value, disabled, onChange }: { id: string; value: Currency; disabled?: boolean; onChange: (c: Currency) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <select id={id} className="input currency-select" value={value} disabled={disabled} aria-label={t('currency.label')} onChange={(e) => onChange(e.target.value as Currency)}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {currencyLabel(c, lang)}
        </option>
      ))}
    </select>
  );
}
