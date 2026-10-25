import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cleanName, isValidName, SPLIT_DEFAULT_ICON, SPLIT_NAME_MAX, splitCover, type EntryIcon } from '@qpq/shared';
import { Button, Cover, Icon, Sheet, TextField, useToast, type IconName } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { hideSplit } from '../data/local.ts';
import { adminHandover, leaveBlock, type Member, type Money, type SplitDoc } from '../data/model.ts';
import { startSplitEdit, type SplitPatch } from '../data/splitEdits.ts';
import { useOptimisticAction } from '../lib/optimistic.ts';
import { copyText, inviteUrl, useWho } from './common.tsx';
import { IconPicker } from './EntryIcon.tsx';
import { DeleteSplitSheet, FinalizeSheet } from './FinalizeSheet.tsx';
import { PhotoCropSheet } from './PhotoCrop.tsx';
import { clearPendingCover, SplitCover, useUploadCover } from './Photos.tsx';
import { useReasonText } from './reasons.ts';

export type SplitActionKey = 'config' | 'edit' | 'invite' | 'finalize' | 'reopen' | 'leave' | 'delete';

export interface SplitActionItem {
  key: SplitActionKey;
  icon: IconName;
  label: string;
  danger?: boolean;
  /** Só admin: para membro aparece desabilitado, com "só admin". */
  adminOnly?: boolean;
}

/**
 * As ações do split (spec 04), iguais no menu de dentro do split e no "⋯" da home: Configurações
 * do split, Convidar, Finalizar ou Reabrir, Sair e Excluir. Mesmas folhas e regras nos dois lugares; tudo
 * otimista. \`inside\`: dentro do split (Finalizar leva ao Meu saldo; Convidar do admin vai a Pessoas).
 */
export function useSplitActions(split: SplitDoc, me: Member, money: Money, inside: boolean) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const reasonText = useReasonText();
  const run = useOptimisticAction();
  const who = useWho(split, me);
  const uploadCover = useUploadCover();
  const [sheet, setSheet] = useState<'edit' | 'leave' | 'finalize' | 'delete' | null>(null);
  const id = split.id;
  const isAdmin = me.admin;
  const isOpen = split.status === 'open';
  const close = () => setSheet(null);

  const items: SplitActionItem[] = [
    // Todos abrem; membro vê só leitura (spec 04).
    { key: 'config', icon: 'sliders', label: t('config.menu') },
    { key: 'invite', icon: 'link', label: t('menu.invite') },
    isOpen ? { key: 'finalize', icon: 'flag', label: t('fin.menu'), adminOnly: true } : { key: 'reopen', icon: 'reopen', label: t('fin.reopen'), adminOnly: true },
    { key: 'delete', icon: 'trash', label: t('del.menu'), danger: true, adminOnly: true },
    { key: 'leave', icon: 'leave', label: t('menu.leave'), danger: true },
  ];

  const invite = async () => {
    if (inside && isAdmin) {
      void navigate(`/s/${id}/pessoas`);
      return;
    }
    const link = inviteUrl(split.code);
    toast.show({ text: (await copyText(t('invite.message', { name: split.name, link }))) ? t('common.linkCopied') : link });
  };

  /** Mudança no split que vale na hora (home e dentro) e volta, com aviso, se o servidor recusar. */
  const editSplit = (patch: SplitPatch, call: () => Promise<unknown>, done: string, after?: () => void) => {
    let edit: ReturnType<typeof startSplitEdit> | null = null;
    void run({
      apply: () => {
        edit = startSplitEdit(id, patch);
        after?.();
        return () => edit?.undo();
      },
      commit: async () => {
        await call();
        edit?.settle();
        toast.show({ text: done });
      },
      errorText: (e) => reasonText(detailsOf(e)),
    });
  };

  const changeStatus = (status: 'open' | 'done') => {
    close();
    editSplit(
      { status, doneAt: status === 'done' ? new Date() : null },
      () => (status === 'done' ? api.finalizeSplit({ splitId: id }) : api.reopenSplit({ splitId: id })),
      status === 'done' ? t('fin.done') : t('fin.reopened'),
      () => {
        if (inside && status === 'done') void navigate(`/s/${id}/saldo`, { replace: true });
      },
    );
  };

  /** Sair e excluir: o split some na hora (da home e de dentro); volta se o servidor recusar. */
  const goAway = (call: () => Promise<unknown>, done: string) => {
    close();
    void run({
      apply: () => {
        hideSplit(id, true);
        if (inside) void navigate('/', { replace: true });
        return () => hideSplit(id, false);
      },
      commit: async () => {
        await call();
        toast.show({ text: done });
      },
      errorText: (e) => reasonText(detailsOf(e)),
    });
  };

  const perform = (key: SplitActionKey) => {
    if (key === 'config') void navigate(`/s/${id}/config`);
    else if (key === 'invite') void invite();
    else if (key === 'reopen') changeStatus('open');
    else setSheet(key);
  };

  const block = leaveBlock(split, money, me.id);
  // Último admin saindo: avisa para quem o papel vai (decisão 4, revista).
  const handover = adminHandover(split, me.id);

  const sheets: ReactNode = (
    <>
      <Sheet open={sheet === 'leave'} title={t('leave.title', { name: split.name })} onClose={close}>
        {block ? (
          <div className="alert" role="alert">
            <Icon name="alert" size="sm" />
            <span>{t('blocks.leaveBalance')}</span>
          </div>
        ) : (
          <>
            <p className="muted">{t('leave.body')}</p>
            {handover && (
              <div className="info">
                <Icon name="shield" />
                <span>{handover.heir ? t('handover.leaveHeir', { name: handover.heir.name }) : t('handover.leaveNext')}</span>
              </div>
            )}
          </>
        )}
        <div className="sheet-acts">
          {!block && (
            <Button variant="danger" block onClick={() => goAway(() => api.leaveSplit({ splitId: id }), t('leave.left', { name: split.name }))}>
              {t('leave.confirm')}
            </Button>
          )}
          <Button variant="ghost" block onClick={close}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
      <FinalizeSheet open={sheet === 'finalize'} split={split} money={money} who={who} onClose={close} onConfirm={() => changeStatus('done')} />
      <DeleteSplitSheet open={sheet === 'delete'} split={split} money={money} who={who} onClose={close} onConfirm={() => goAway(() => api.deleteSplit({ splitId: id }), t('del.done', { name: split.name }))} />
      {sheet === 'edit' && (
        <EditSplitSheet
          split={split}
          onClose={close}
          onSave={(patch, photo) => {
            close();
            if (patch.icon !== undefined || patch.clearPhoto) clearPendingCover(id);
            if (photo) uploadCover(id, photo);
            if (Object.keys(patch).length === 0) return;
            editSplit(patch, () => api.updateSplit({ splitId: id, ...patch }), t('editSplit.saved'));
          }}
        />
      )}
    </>
  );

  return { items, perform, sheets, isAdmin, editSplit };
}

/**
 * "Editar split" (só admin): nome e capa, como na criação. A capa abre o mesmo seletor (Ícones,
 * Emoji, "Enviar foto" com o recorte e "Remover"). Só o que mudou vai para o servidor.
 */
function EditSplitSheet({ split, onClose, onSave }: { split: SplitDoc; onClose: () => void; onSave: (patch: SplitPatch, photo: File | null) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(split.name);
  // undefined = capa sem mudança; null = ícone de pessoas.
  const [icon, setIcon] = useState<EntryIcon | null | undefined>(undefined);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [picking, setPicking] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const clean = cleanName(name);
  const valid = isValidName(clean, SPLIT_NAME_MAX);
  const shownIcon = icon === undefined ? splitCover(split) : splitCover({ id: split.id, icon });
  const hasPhoto = !!photo || (!!split.photo && !clearPhoto);

  const save = () => {
    const patch: SplitPatch = {};
    if (clean !== split.name) patch.name = clean;
    if (icon !== undefined) patch.icon = icon;
    if (clearPhoto && split.photo && !photo) patch.clearPhoto = true;
    onSave(patch, photo);
  };

  return (
    <Sheet open title={t('editSplit.title')} onClose={onClose}>
      <div className="name-cover">
        <button type="button" className="cover-pick" aria-label={t('create.coverPick')} title={t('create.coverPick')} onClick={() => setPicking(true)}>
          {photoUrl ? <Cover icon={shownIcon} src={photoUrl} /> : hasPhoto ? <SplitCover split={split} /> : <Cover icon={shownIcon} />}
          <span className="cover-edit" aria-hidden="true">
            <Icon name="pencil" size="sm" />
          </span>
        </button>
        <TextField label={`${t('create.name')} *`} value={name} maxLength={SPLIT_NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </div>
      <IconPicker
        open={picking}
        value={shownIcon}
        removeTo={SPLIT_DEFAULT_ICON}
        onClose={() => setPicking(false)}
        onChange={(next) => {
          setIcon(next);
          setPhoto(null);
          setPhotoUrl(null);
          setClearPhoto(true);
        }}
        photo={{ has: hasPhoto, onFile: setCropFile }}
      />
      <PhotoCropSheet
        file={cropFile}
        kind="cover"
        name={clean}
        icon={shownIcon}
        onCancel={() => setCropFile(null)}
        onDone={(cropped) => {
          setPhoto(cropped);
          setPhotoUrl(URL.createObjectURL(cropped));
          setClearPhoto(false);
          setCropFile(null);
        }}
      />
      <div className="sheet-acts">
        <Button block disabled={!valid} onClick={save}>
          {t('editSplit.save')}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  );
}

/** Item do menu do split: as ações de admin aparecem desabilitadas para membro, com "só admin". */
export function SplitMenuItem({ item, isAdmin, onClick, after }: { item: SplitActionItem; isAdmin: boolean; onClick: () => void; after?: ReactNode }) {
  const { t } = useTranslation();
  const locked = !!item.adminOnly && !isAdmin;
  return (
    <>
      <button type="button" className={`mi ${item.danger ? 'danger' : ''}`} role="menuitem" disabled={locked} onClick={onClick}>
        <Icon name={item.icon} />
        {item.label}
        {locked && <span className="cap">{t('fin.adminOnly')}</span>}
      </button>
      {after}
    </>
  );
}
