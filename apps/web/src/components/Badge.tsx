import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';

export type Tone = 'pos' | 'neg' | 'zero' | 'acc';

/** Selo de status. Cor nunca é o único sinal: sempre texto, e ícone quando houver. */
export function Badge({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`badge b-${tone}`}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}
