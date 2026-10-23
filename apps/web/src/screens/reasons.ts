import { useTranslation } from 'react-i18next';
import type { ErrorDetails } from '@qpq/shared';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';

/** Texto para o motivo de recusa de uma Function (ou o aviso genérico). */
export function useReasonText() {
  const { t } = useTranslation();
  const lang = useLang();
  return (details: ErrorDetails | null): string => {
    if (!details) return t('errors.saveFailed');
    const name = details.name ?? '';
    const amount = details.amount !== undefined ? formatCents(details.amount, lang, { signed: true }) : '';
    switch (details.reason) {
      case 'last-admin':
        return t('blocks.lastAdmin');
      case 'balance-not-zero':
        return name ? t('blocks.balanceRemove', { name, amount }) : t('blocks.leaveBalance');
      case 'in-expenses':
        return t('blocks.inExpenses', { name });
      case 'not-joined':
        return t('blocks.notJoined', { name });
      case 'invalid-input':
      case 'invalid-code':
      case 'name-taken':
      case 'name-claimed':
      case 'not-member':
      case 'not-admin':
      case 'not-guest':
      case 'invalid-recovery':
      case 'invalid-merge':
      case 'merge-choice':
        return t(`reasons.${details.reason}`, { name });
      default:
        return t('errors.saveFailed');
    }
  };
}
