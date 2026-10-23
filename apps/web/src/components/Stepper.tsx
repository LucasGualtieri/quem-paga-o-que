import { useTranslation } from 'react-i18next';
import { Icon } from './Icon.tsx';

export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="stepper">
      <button type="button" aria-label={t('common.less')} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" />
      </button>
      <span className="v">{value}</span>
      <button type="button" aria-label={t('common.more')} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Icon name="plus" />
      </button>
    </div>
  );
}
