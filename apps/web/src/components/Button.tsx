import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = { primary: 'btn-p', secondary: 'btn-s', ghost: 'btn-g', danger: 'btn-d' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  /** Ocupa a largura toda (padrão nas telas do celular). */
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block, icon, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx('btn', VARIANT[variant], size === 'sm' && 'btn-sm', block && 'btn-block', className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
