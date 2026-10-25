import { deleteObject, ref } from 'firebase/storage';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { avatarPath, coverPath, splitCover } from '@qpq/shared';
import { Avatar, avatarColor, Cover, useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { previewPhoto, uploadPhoto, usePhoto } from '../data/files.ts';
import { saveProfile } from '../data/hooks.ts';
import type { MemberDoc, SplitDoc } from '../data/model.ts';
import { firebase } from '../firebase.ts';
import { ImageError, photoName } from '../lib/image.ts';
import { useReasonText } from './reasons.ts';

// Capa recém-escolhida (ao criar ou editar o split): aparece na hora, antes de subir (UX otimista).
let pendingCovers: ReadonlyMap<string, { url: string; path: string }> = new Map();
const listeners = new Set<() => void>();
function setPending(splitId: string, cover: { url: string; path: string } | null) {
  const next = new Map(pendingCovers);
  if (cover) next.set(splitId, cover);
  else next.delete(splitId);
  pendingCovers = next;
  for (const l of listeners) l();
}
/** Trocou a foto por ícone ou emoji: a foto recém-escolhida deixa de valer. */
export function clearPendingCover(splitId: string): void {
  if (pendingCovers.has(splitId)) setPending(splitId, null);
}
function usePendingCovers() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pendingCovers,
  );
}

/** Capa do split: foto (do Storage ou recém-escolhida), ícone ou emoji. */
export function SplitCover({ split, size }: { split: Pick<SplitDoc, 'id' | 'emoji' | 'icon' | 'photo'>; size?: 'sm' | 'xl' }) {
  const photo = usePhoto(split.photo ?? null);
  const pending = usePendingCovers().get(split.id);
  // A recém-escolhida vale até o servidor ter a nova (que já está no cache pelo previewPhoto).
  const src = pending && (split.photo !== pending.path || photo?.status !== 'ready') ? pending.url : photo?.status === 'ready' ? photo.url : null;
  return <Cover icon={splitCover(split)} {...(size ? { size } : {})} src={src} />;
}

/** Sobe a foto da capa e liga ao split (só admin; quem cria é admin), ao criar ou editar. */
export function useUploadCover() {
  const { t } = useTranslation();
  const toast = useToast();
  const reasonText = useReasonText();
  return (splitId: string, file: File) => {
    const path = coverPath(splitId, photoName());
    setPending(splitId, { url: URL.createObjectURL(file), path });
    previewPhoto(path, file);
    uploadPhoto(path, file)
      .then(() => api.setSplitPhoto({ splitId, path }))
      .catch((error: unknown) => {
        setPending(splitId, null);
        toast.show({ kind: 'error', text: error instanceof ImageError ? t('pay.imageError') : reasonText(detailsOf(error)) });
      });
  };
}

/** Avatar da pessoa com a foto de perfil, se tiver. */
export function ProfileAvatar({ name, photoPath, size, className }: { name: string; photoPath: string | null; size?: 'sm' | 'lg'; className?: string }) {
  const photo = usePhoto(photoPath);
  return <Avatar name={name || '?'} color={1} {...(size ? { size } : {})} {...(className ? { className } : {})} src={photo?.status === 'ready' ? photo.url : null} />;
}

/** Avatar de quem está no split: a foto de perfil, se tiver; senão a inicial na cor da pessoa. */
export function MemberAvatar({ member, name, size, className }: { member: Pick<MemberDoc, 'name' | 'joinOrder' | 'photo'> | null | undefined; name?: string; size?: 'sm' | 'lg'; className?: string }) {
  const photo = usePhoto(member?.photo ?? null);
  return <Avatar name={name ?? member?.name ?? '?'} color={avatarColor(member?.joinOrder ?? 0)} {...(size ? { size } : {})} {...(className ? { className } : {})} src={photo?.status === 'ready' ? photo.url : null} />;
}

/** "Trocar foto": a foto nova vale na hora (cache local do Firestore); se não subir, volta a anterior. */
export function useChangeProfilePhoto(uid: string, current: string | null) {
  const { t } = useTranslation();
  const toast = useToast();
  return (file: File) => {
    const path = avatarPath(uid, photoName());
    previewPhoto(path, file);
    void saveProfile(uid, { photoPath: path });
    // Depois de subir, o servidor espelha a foto nos splits (quem divide o split vê no avatar).
    uploadPhoto(path, file)
      .then(() => api.setProfilePhoto({ path }))
      .then(
        () => {
          toast.show({ text: t('photo.saved') });
          if (current) void deleteObject(ref(firebase().storage, current)).catch(() => {});
        },
        (error: unknown) => {
          void saveProfile(uid, { photoPath: current });
          toast.show({ kind: 'error', text: error instanceof ImageError ? t('pay.imageError') : t('errors.saveFailed') });
        },
      );
  };
}
