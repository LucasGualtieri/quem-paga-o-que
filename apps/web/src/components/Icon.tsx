import { cx } from '../lib/cx.ts';

// Traços copiados do protótipo (reference/design), viewBox 24×24.
const PATHS = {
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 7.5V12l3 2'],
  in: ['M17 7L7 17M16 17H7V8'],
  out: ['M7 17L17 7M8 7h9v9'],
  x: ['M6 6l12 12M18 6L6 18'],
  people: ['M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6'],
  food: ['M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 0-3.5 2.5-3.5 6.5S15 14 17 14'],
  sun: ['M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  alert: ['M12 8v5M12 16.5v.5'],
  back: ['M15 5l-7 7 7 7'],
} as const;

const CIRCLES: Partial<Record<IconName, Array<[number, number, number]>>> = {
  clock: [[12, 12, 8.5]],
  people: [[9, 8, 3.5]],
  sun: [[12, 12, 4]],
  alert: [[12, 12, 9]],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size, className }: { name: IconName; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <svg className={cx('ic', size, className)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {CIRCLES[name]?.map(([cx_, cy, r]) => <circle key={`${cx_}-${cy}`} cx={cx_} cy={cy} r={r} />)}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
