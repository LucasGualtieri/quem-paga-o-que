import type { HTMLAttributes, ReactNode } from 'react';
import { coverColorOf, type EntryIcon } from '@qpq/shared';
import { cx } from '../lib/cx.ts';
import { Icon, type IconName } from './Icon.tsx';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card', className)} {...rest} />;
}

/** Cor da capa do split: 1–8, de --cv-N em tokens.css. */
export type CoverColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Capa do split: o ícone ou emoji (com a cor de fundo da escolha), ou a foto (`src`) quando houver. */
export function Cover({ icon, size, src }: { icon: EntryIcon; size?: 'sm' | 'xl'; src?: string | null }) {
  return (
    <span className={cx('cover', `cv-${coverColorOf(icon)}`, size)} aria-hidden="true">
      {src ? <img src={src} alt="" /> : icon.kind === 'emoji' ? icon.value : <Icon name={icon.name as IconName} {...(size === 'sm' ? {} : { size: 'lg' as const })} />}
    </span>
  );
}

export function SplitCard({ icon, name, meta, balance }: { icon: EntryIcon; name: string; meta: ReactNode; balance?: ReactNode }) {
  return (
    <Card className="splitcard">
      <Cover icon={icon} />
      <span className="sc-mid">
        <span className="sc-name">{name}</span>
        <span className="cap">{meta}</span>
      </span>
      {balance}
    </Card>
  );
}

export function ListItem({ icon, title, caption, amount, mine }: { icon: ReactNode; title: string; caption: ReactNode; amount: string; mine?: ReactNode }) {
  return (
    <Card className="listitem">
      <span className="tagico" aria-hidden="true">
        {icon}
      </span>
      <span className="mid">
        <span className="ttl">{title}</span>
        <span className="cap">{caption}</span>
      </span>
      <span className="right">
        <span className="amt strong">{amount}</span>
        {mine}
      </span>
    </Card>
  );
}
