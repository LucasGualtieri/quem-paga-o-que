import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ledger } from '@qpq/calc';
import { nameKey } from '@qpq/shared';
import { Button, Icon, Sheet, TextField } from '../components/index.ts';
import { currencyOf, orderOf, today, type Money, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { formatCents } from '../lib/money.ts';
import { MemberAvatar } from './Photos.tsx';

/** O que ficou pendente, com os pagamentos simplificados (`sug`): Finalizar e Excluir mostram antes. */
export function PendingList({ split, money, who }: { split: SplitDoc; money: Money; who: (id: string) => string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { sug } = ledger({ order: orderOf(split), expenses: money.expenses, payments: money.payments, today: today() });
  const total = sug.reduce((s, g) => s + g.amount, 0);
  const member = (id: string) => split.members[id];
  return (
    <div className="list fin-list">
      <div className="row fin-head">
        <span className="mid">
          <span className="ttl">{sug.length ? t('fin.pending') : t('fin.allSettled')}</span>
        </span>
        {sug.length > 0 && <span className="amt strong neg">{formatCents(-total, lang, { currency: currencyOf(split) })}</span>}
      </div>
      {sug.map((g) => (
        <div key={`${g.from}-${g.to}`} className="row fin-row">
          <span className="avpair" aria-hidden="true">
            <MemberAvatar member={member(g.from)} size="sm" />
            <Icon name="arrow" size="sm" />
            <MemberAvatar member={member(g.to)} size="sm" />
          </span>
          <span className="mid">
            <span className="ttl">{t('fin.pair', { from: who(g.from), to: who(g.to) })}</span>
          </span>
          <span className="amt strong">{formatCents(g.amount, lang, { currency: currencyOf(split) })}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * "Finalizar split" (spec 04): lista o que ficou pendente com os pagamentos simplificados
 * (`sug`, o único lugar onde a simplificação aparece) e vira "Finalizar mesmo assim".
 */
export function FinalizeSheet({ open, split, money, who, onClose, onConfirm }: { open: boolean; split: SplitDoc; money: Money; who: (id: string) => string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!open) return null;
  const { sug, F } = ledger({ order: orderOf(split), expenses: money.expenses, payments: money.payments, today: today() });
  // Parcelas a vencer (spec 05): continuam vencendo, mas finalizado ninguém registra pagamento.
  const future = Object.values(F).reduce((s, row) => s + Object.values(row).reduce((a, v) => a + v, 0), 0);
  return (
    <Sheet open title={t('fin.title', { name: split.name })} onClose={onClose}>
      <span className="tagico lg fin-ico" aria-hidden="true">
        <Icon name="flag" size="lg" />
      </span>
      <p className="muted" style={{ textWrap: 'pretty' }}>
        {t('fin.body')} {t('fin.proofs')}
      </p>
      <PendingList split={split} money={money} who={who} />
      {future > 0 && (
        <div className="info">
          <Icon name="clock" />
          <span>{t('fin.future', { amount: formatCents(future, lang, { currency: currencyOf(split) }) })}</span>
        </div>
      )}
      <div className="sheet-acts">
        <Button block onClick={onConfirm}>
          {sug.length || future > 0 ? t('fin.anyway') : t('fin.menu')}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * "Excluir split" (só admin): mostra o que ficou pendente e só libera o botão vermelho depois de
 * digitar o nome do split. Some de vez, para todo mundo.
 */
export function DeleteSplitSheet({ open, split, money, who, onClose, onConfirm }: { open: boolean; split: SplitDoc; money: Money; who: (id: string) => string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  if (!open) return null;
  const ok = nameKey(typed) === nameKey(split.name);
  const close = () => {
    setTyped('');
    onClose();
  };
  return (
    <Sheet open title={t('del.title', { name: split.name })} onClose={close}>
      <span className="tagico lg warn" aria-hidden="true">
        <Icon name="trash" size="lg" />
      </span>
      <p className="muted" style={{ textWrap: 'pretty' }}>
        {t('del.body')}
      </p>
      <PendingList split={split} money={money} who={who} />
      <TextField label={t('del.typeName', { name: split.name })} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
      <div className="sheet-acts">
        <Button
          variant="danger"
          block
          disabled={!ok}
          onClick={() => {
            setTyped('');
            onConfirm();
          }}
        >
          {t('del.confirm')}
        </Button>
        <Button variant="ghost" block onClick={close}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  );
}
