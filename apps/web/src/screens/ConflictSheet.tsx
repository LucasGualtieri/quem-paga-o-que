import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button, Sheet } from '../components/index.ts';
import { setConflict, useConflict } from '../data/expenseStore.ts';

/** Decisão 8: alguém salvou a despesa antes. "Ver a versão nova" ou "Salvar a minha por cima". */
export function ConflictSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const c = useConflict();
  const close = () => setConflict(null);
  return (
    <Sheet open={c !== null} title={t('expense.conflict.title', { name: c?.name || t('expense.conflict.someone') })} onClose={close}>
      <p className="muted">{t('expense.conflict.body')}</p>
      <div className="sheet-acts">
        <Button
          block
          onClick={() => {
            const target = c;
            close();
            if (target) void navigate(`/s/${target.splitId}/despesa/${target.expenseId}`, { replace: true });
          }}
        >
          {t('expense.conflict.seeNew')}
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => {
            const target = c;
            close();
            target?.retry();
          }}
        >
          {t('expense.conflict.overwrite')}
        </Button>
      </div>
    </Sheet>
  );
}
