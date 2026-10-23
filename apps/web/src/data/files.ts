import { getBlob, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { firebase } from '../firebase.ts';
import { compressImage } from '../lib/image.ts';

/**
 * Fotos no Storage (comprovantes, capa, perfil). A leitura passa pelas regras a cada vez
 * (`getBlob`, nunca link público de download), para valer "Quem vê comprovantes" (decisão 9).
 */

/** Endereço local (blob:) de cada foto já carregada ou recém-escolhida neste aparelho. */
const urls = new Map<string, string>();

/** Reduz e envia; a foto já fica visível neste aparelho antes de terminar de subir. */
export async function uploadPhoto(path: string, file: Blob): Promise<void> {
  const blob = await compressImage(file);
  urls.set(path, URL.createObjectURL(blob));
  await uploadBytes(ref(firebase().storage, path), blob, { contentType: 'image/jpeg' });
}

/** Mostra a foto que a pessoa acabou de escolher sob o caminho que ela vai ter. */
export function previewPhoto(path: string, file: Blob): void {
  urls.set(path, URL.createObjectURL(file));
}

export type PhotoState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' };

const inflight = new Map<string, Promise<string>>();

function load(path: string): Promise<string> {
  let p = inflight.get(path);
  if (!p) {
    p = getBlob(ref(firebase().storage, path)).then((b) => {
      const url = URL.createObjectURL(b);
      urls.set(path, url);
      return url;
    });
    inflight.set(path, p);
    p.catch(() => inflight.delete(path));
  }
  return p;
}

/** A foto em `path` (ou nada, sem caminho). Erro = sem permissão, apagada ou sem rede. */
export function usePhoto(path: string | null | undefined): PhotoState | null {
  const [state, setState] = useState<PhotoState | null>(() => (path ? (urls.has(path) ? { status: 'ready', url: urls.get(path)! } : { status: 'loading' }) : null));
  useEffect(() => {
    if (!path) {
      setState(null);
      return;
    }
    const known = urls.get(path);
    if (known) {
      setState({ status: 'ready', url: known });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    load(path).then(
      (url) => alive && setState({ status: 'ready', url }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
