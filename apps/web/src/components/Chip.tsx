import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx.ts';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  pressed: boolean;
  /** Avatar à esquerda (chips de pessoa em "Pago por"). */
  avatar?: ReactNode;
}

export function Chip({ pressed, avatar, className, children, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={pressed} className={cx('chip', pressed && 'on', avatar !== undefined && 'hasav', className)} {...rest}>
      {avatar}
      {children}
    </button>
  );
}
