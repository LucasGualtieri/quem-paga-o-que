/**
 * Foto do comprovante, da capa ou do perfil antes de subir (decisão 9): no máximo 1600 px
 * no lado maior e JPEG de até 1 MB. Redesenhar no canvas também tira os metadados
 * (como a localização da câmera).
 */
export const MAX_SIDE = 1600;
export const MAX_BYTES = 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55];

/** Tamanho que cabe em `max` mantendo a proporção (nunca aumenta). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A imagem não deu para ler (formato que o navegador não abre) ou não coube em 1 MB. */
export class ImageError extends Error {}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function compressImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImageError('not-image');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('unreadable');
  }
  let side = MAX_SIDE;
  try {
    for (let attempt = 0; attempt < 4; attempt++, side = Math.round(side * 0.75)) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
      for (const q of QUALITIES) {
        const blob = await encode(canvas, q);
        if (blob && blob.size <= MAX_BYTES) return blob;
      }
    }
  } finally {
    bitmap.close();
  }
  throw new ImageError('too-big');
}

/** Nome de arquivo novo a cada envio (o Storage não deixa sobrescrever). */
export function photoName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
}
