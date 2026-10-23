import type { ReactNode } from 'react';
import { cx } from '../lib/cx.ts';
import { Icon } from './Icon.tsx';

/** Cor do avatar: 1–7, de --av-N / --av-N-ink em tokens.css. */
export type AvatarColor = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Cor estável por ordem de entrada no split. */
export function avatarColor(joinOrder: number): AvatarColor {
  return ((joinOrder % 7) + 1) as AvatarColor;
}

export function initialOf(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase() || '?';
}

export function Avatar({ name, color, size, className }: { name: string; color: AvatarColor; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <span className={cx('av', `av-${color}`, size, className)} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}

interface SelectProps {
  /** Texto mostrado ("Você" ou o nome). */
  name: string;
  /** Nome da pessoa, para a inicial do avatar; padrão: `name`. */
  avatarName?: string;
  color: AvatarColor;
  selected: boolean;
  /** É você: nome em negrito (sem anel extra, sem bolinha). */
  me?: boolean;
  onClick: () => void;
}

/** Linha de pessoa sem checkbox: anel no avatar + selo de check + aria-pressed. */
export function PersonRow({
  name,
  avatarName,
  color,
  selected,
  me,
  caption,
  trailing,
  onClick,
}: SelectProps & { caption?: ReactNode; trailing?: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} className={cx('prow', selected ? 'on' : 'off', me && 'me')} onClick={onClick}>
      <span className="avsel">
        <Avatar name={avatarName ?? name} color={color} />
        <span className="avck" aria-hidden="true">
          <Icon name="check" />
        </span>
      </span>
      <span className="prow-mid">
        <span className="ttl">{name}</span>
        {caption && <span className="cap">{caption}</span>}
      </span>
      {trailing !== undefined && <span className="amt prow-amt">{trailing}</span>}
    </button>
  );
}

/** Avatar com o nome embaixo, para escolher quem consumiu um item. */
export function AvatarToggle({ name, avatarName, color, selected, me, all, onClick }: SelectProps & { all?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} className={cx('avt', selected ? 'on' : 'off')} onClick={onClick}>
      {all ? (
        <span className="av allav" aria-hidden="true">
          <Icon name="people" size="sm" />
        </span>
      ) : (
        <Avatar name={avatarName ?? name} color={color} />
      )}
      <span className={cx('avn', me && 'me')}>{name}</span>
    </button>
  );
}
