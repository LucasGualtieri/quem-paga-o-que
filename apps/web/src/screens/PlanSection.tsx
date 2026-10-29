import { useTranslation } from 'react-i18next';
import { dueCount, installmentDates, splitInstallments } from '@qpq/calc';
import { Badge, Button } from '../components/index.ts';
import { membersInOrder, sharesOf, today, type ExpenseDoc, type Member, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { dateOf, dayMonthYear } from '../lib/dates.ts';
import { MemberAvatar } from './Photos.tsx';
import { useWho } from './common.tsx';

/**
 * Parcelas da despesa (spec 05): o calendário (cada parcela com o valor total: venceu, próxima,
 * que já está no saldo, ou a vencer) e, para quem tem parcela fora do saldo, "Antecipar": a
 * próxima ou todas. Pode antecipar a própria pessoa, quem pagou a despesa ou um admin, com o
 * split aberto.
 */
export function PlanSection({ split, me, doc, fmt, onAdvance }: { split: SplitDoc; me: Member; doc: ExpenseDoc; fmt: (c: number) => string; onAdvance: (e: ExpenseDoc, memberId: string, all: boolean) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const who = useWho(split, me);
  const plan = doc.installments!;
  const day = today();
  const dates = installmentDates(plan);
  // A primeira que ainda não venceu já está no saldo: é a "próxima" (spec 05).
  const current = dates.filter((d) => d <= day).length;
  const totals = splitInstallments(doc.amount, plan.count);
  const sh = sharesOf(doc, split);
  const isOpen = split.status === 'open';
  const people = membersInOrder(split).filter((m) => m.id !== doc.payer && (sh[m.id] ?? 0) > 0);

  return (
    <section>
      <div className="sec-h">
        <h2 className="h4">{t('expense.plan.title')}</h2>
        <span className="cap amt">{t('expense.plan.sum', { count: plan.count, amount: fmt(totals[1]!) })}</span>
      </div>
      <div className="list">
        {dates.map((d, i) => (
          <div key={d} className="row plan-line">
            <span className="mid">
              <span className="ttl">{t('expense.plan.nth', { n: i + 1, count: plan.count })}</span>
              <span className="cap">{dayMonthYear(dateOf(d), lang)}</span>
            </span>
            <span className="amt">{fmt(totals[i]!)}</span>
            {d <= day ? (
              <Badge tone="zero" icon="check">
                {t('expense.plan.due')}
              </Badge>
            ) : i === current ? (
              <Badge tone="acc" icon="clock">
                {t('expense.plan.current')}
              </Badge>
            ) : (
              <Badge tone="zero" icon="clock">
                {t('expense.plan.notYet')}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {people.length > 0 && (
        <div className="list plan-people">
          {people.map((m) => {
            const n = dueCount(doc, m.id, day);
            const mine = splitInstallments(sh[m.id] ?? 0, plan.count);
            const left = mine.slice(n).reduce((s, x) => s + x, 0);
            const can = isOpen && n < plan.count && (m.id === me.id || doc.payer === me.id || me.admin);
            return (
              <div key={m.id} className="row2">
                <div className="top">
                  <MemberAvatar member={m} />
                  <span className="mid">
                    <span className="ttl">{who(m.id)}</span>
                    <span className="cap amt">{n < plan.count ? t('expense.plan.counted', { n, count: plan.count, left: fmt(left) }) : t('expense.plan.allCounted')}</span>
                  </span>
                </div>
                {can && (
                  <div className="acts end">
                    {n + 1 < plan.count && (
                      <Button size="sm" variant="ghost" onClick={() => onAdvance(doc, m.id, true)}>
                        {t('expense.plan.advanceAll', { amount: fmt(left) })}
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => onAdvance(doc, m.id, false)}>
                      {t('expense.plan.advanceNext', { amount: fmt(mine[n]!) })}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="cap plan-note">{t('expense.plan.note')}</p>
    </section>
  );
}
