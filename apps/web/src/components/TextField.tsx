import { useId, type InputHTMLAttributes } from 'react';
import { cx } from '../lib/cx.ts';
import { Icon } from './Icon.tsx';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  /** Esconde o rótulo visualmente (continua para leitores de tela). */
  hideLabel?: boolean;
}

export function TextField({ label, error, hideLabel, className, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-err`;
  return (
    <div className="field">
      <label htmlFor={inputId} className={cx('label', hideLabel && 'sr-only')}>
        {label}
      </label>
      <input
        id={inputId}
        className={cx('input', error && 'err', className)}
        {...(error ? { 'aria-invalid': true, 'aria-describedby': errId } : {})}
        {...rest}
      />
      {error && (
        <p id={errId} className="errmsg">
          <Icon name="alert" size="sm" />
          {error}
        </p>
      )}
    </div>
  );
}
