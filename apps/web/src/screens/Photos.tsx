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

// Capa recém-escolhida ao criar o split: aparece na hora, antes de subir (UX otimista).
let pendingCovers: ReadonlyMap<string, string> = new Map();
const listeners = new Set<() => void>();
function setPending(splitId: string, url: string | null) {
  const next = new Map(pendingCovers);
  if (url) next.set(splitId, url);
  else next.delete(splitId);
  pendingCovers = next;
  for (const l of listeners) l();
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
  const src = photo?.status === 'ready' ? photo.url : (pending ?? null);
  return <Cover icon={splitCover(split)} {...(size ? { size } : {})} src={src} />;
}

/** Depois de criar o split: sobe a foto da capa e liga ao split (só admin; quem cria é admin). */
export function useUploadCover() {
  const { t } = useTranslation();
  const toast = useToast();
  const reasonText = useReasonText();
  return (splitId: string, file: File) => {
    const path = coverPath(splitId, photoName());
    setPending(splitId, URL.createObjectURL(file));
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
