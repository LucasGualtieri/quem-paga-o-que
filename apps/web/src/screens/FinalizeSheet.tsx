import { useTranslation } from 'react-i18next';
import { ledger } from '@qpq/calc';
import { Avatar, avatarColor, Button, Icon, Sheet } from '../components/index.ts';
import { orderOf, type Money, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';

/**
 * "Finalizar split" (spec 04): lista o que ficou pendente com os pagamentos simplificados
 * (`sug`, o único lugar onde a simplificação aparece) e vira "Finalizar mesmo assim".
 */
export function FinalizeSheet({ open, split, money, who, onClose, onConfirm }: { open: boolean; split: SplitDoc; money: Money; who: (id: string) => string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!open) return null;
  const { sug } = ledger({ order: orderOf(split), expenses: money.expenses, payments: money.payments });
  const total = sug.reduce((s, g) => s + g.amount, 0);
  const member = (id: string) => split.members[id];
  return (
    <Sheet open title={t('fin.title', { name: split.name })} onClose={onClose}>
      <span className="tagico lg fin-ico" aria-hidden="true">
        <Icon name="flag" size="lg" />
      </span>
      <p className="muted" style={{ textWrap: 'pretty' }}>
        {t('fin.body')} {t('fin.proofs')}
      </p>
      <div className="list fin-list">
        <div className="row fin-head">
          <span className="mid">
            <span className="ttl">{sug.length ? t('fin.pending') : t('fin.allSettled')}</span>
          </span>
          {sug.length > 0 && <span className="amt strong neg">{formatCents(total, lang)}</span>}
        </div>
        {sug.map((g) => (
          <div key={`${g.from}-${g.to}`} className="row fin-row">
            <span className="avpair" aria-hidden="true">
              <Avatar name={member(g.from)?.name ?? '?'} color={avatarColor(member(g.from)?.joinOrder ?? 0)} size="sm" />
              <Icon name="arrow" size="sm" />
              <Avatar name={member(g.to)?.name ?? '?'} color={avatarColor(member(g.to)?.joinOrder ?? 0)} size="sm" />
            </span>
            <span className="mid">
              <span className="ttl">{t('fin.pair', { from: who(g.from), to: who(g.to) })}</span>
            </span>
            <span className="amt strong">{formatCents(g.amount, lang)}</span>
          </div>
        ))}
      </div>
      <div className="sheet-acts">
        <Button block onClick={onConfirm}>
          {sug.length ? t('fin.anyway') : t('fin.menu')}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  );
}
