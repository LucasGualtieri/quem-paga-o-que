import { cx } from '../lib/cx.ts';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx('tgl', checked && 'on')} onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}
