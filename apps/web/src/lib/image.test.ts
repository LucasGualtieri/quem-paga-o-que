import { describe, expect, it } from 'vitest';
import { compressImage, fitWithin, ImageError, photoName } from './image.ts';

describe('image', () => {
  it('cabe em 1600 px mantendo a proporção, sem aumentar', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 3000, 1600)).toEqual({ width: 533, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('recusa o que não é imagem', async () => {
    await expect(compressImage(new Blob(['%PDF'], { type: 'application/pdf' }))).rejects.toBeInstanceOf(ImageError);
  });

  it('nome novo a cada envio, sempre .jpg e só com caracteres seguros', () => {
    const a = photoName();
    expect(a).toMatch(/^[a-z0-9]+-[a-z0-9]{1,6}\.jpg$/);
    expect(photoName()).not.toBe(a);
  });
});
