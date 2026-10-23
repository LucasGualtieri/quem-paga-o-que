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
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  share: ['M12 3v13M7 8l5-5 5 5M5 14v6h14v-6'],
  lock: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  receipt: ['M6 3h12v18l-3-1.8-3 1.8-3-1.8-3 1.8z', 'M9 8h6M9 12h6'],
  swap: ['M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7'],
  user: ['M4 21a8 8 0 0 1 16 0'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  leave: ['M9 4H5v16h4', 'M14 8l4 4-4 4', 'M18 12H8'],
  dots: [],
} as const;

const CIRCLES: Partial<Record<IconName, Array<[number, number, number]>>> = {
  clock: [[12, 12, 8.5]],
  people: [[9, 8, 3.5]],
  sun: [[12, 12, 4]],
  alert: [[12, 12, 9]],
  user: [[12, 8, 4]],
  dots: [
    [5, 12, 1.8],
    [12, 12, 1.8],
    [19, 12, 1.8],
  ],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size, className }: { name: IconName; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <svg className={cx('ic', size, name === 'dots' && 'dots', className)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {CIRCLES[name]?.map(([cx_, cy, r]) => <circle key={`${cx_}-${cy}`} cx={cx_} cy={cy} r={r} />)}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
