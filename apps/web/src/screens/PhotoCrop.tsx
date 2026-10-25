import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntryIcon } from '@qpq/shared';
import { Avatar, Button, Cover, Sheet } from '../components/index.ts';

/** O recorte sai quadrado neste tamanho; o envio ainda reduz e regrava em JPEG (lib/image.ts). */
const OUT = 640;
const MAX_ZOOM = 4;

type Kind = 'profile' | 'cover';

interface Crop {
  /** Centro da área recortada, em fração da imagem (0–1). */
  cx: number;
  cy: number;
  /** 1 = a imagem inteira cobrindo o quadrado; até MAX_ZOOM. */
  zoom: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lado do recorte em pixels da imagem e o canto de cima à esquerda. */
function region(img: HTMLImageElement, c: Crop) {
  const side = Math.min(img.naturalWidth, img.naturalHeight) / c.zoom;
  return { side, left: c.cx * img.naturalWidth - side / 2, top: c.cy * img.naturalHeight - side / 2 };
}

/** Centro dentro dos limites: o recorte nunca sai da imagem. */
function fit(img: HTMLImageElement, c: Crop): Crop {
  const zoom = clamp(c.zoom, 1, MAX_ZOOM);
  const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
  const hx = side / 2 / img.naturalWidth;
  const hy = side / 2 / img.naturalHeight;
  return { zoom, cx: clamp(c.cx, hx, 1 - hx), cy: clamp(c.cy, hy, 1 - hy) };
}

function draw(img: HTMLImageElement, c: Crop, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const { side, left, top } = region(img, c);
  canvas.getContext('2d')?.drawImage(img, left, top, side, side, 0, 0, size, size);
  return canvas;
}

/**
 * "Ajustar foto" (perfil e capa do split): arrastar para posicionar, zoom com pinça, roda do mouse
 * ou o controle, e a foto já recortada nos lugares onde vai aparecer. Sai um quadrado.
 */
export function PhotoCropSheet({ file, kind, name, icon, onCancel, onDone }: { file: File | null; kind: Kind; name: string; icon?: EntryIcon; onCancel: () => void; onDone: (cropped: File) => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<File | null>(file);
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ cx: 0.5, cy: 0.5, zoom: 1 });
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => setCurrent(file), [file]);
  useEffect(() => {
    if (!current) return;
    const u = URL.createObjectURL(current);
    setUrl(u);
    setError(false);
    setCrop({ cx: 0.5, cy: 0.5, zoom: 1 });
    return () => URL.revokeObjectURL(u);
  }, [current]);

  // Prévia ao vivo: o mesmo recorte, pequeno, a cada mudança.
  useEffect(() => {
    const el = img.current;
    if (!url || !el?.naturalWidth) return;
    const id = requestAnimationFrame(() => setPreview(draw(el, crop, 192).toDataURL('image/jpeg', 0.8)));
    return () => cancelAnimationFrame(id);
  }, [crop, url]);

  if (!file) return null;

  const update = (next: (c: Crop) => Crop) => setCrop((c) => (img.current?.naturalWidth ? fit(img.current, next(c)) : c));
  /** Quantos pixels da tela valem uma fração da imagem (para arrastar). */
  const shown = () => {
    const el = img.current;
    const side = box.current?.clientWidth ?? 280;
    if (!el?.naturalWidth) return { w: side, h: side };
    const scale = (side / Math.min(el.naturalWidth, el.naturalHeight)) * crop.zoom;
    return { w: el.naturalWidth * scale, h: el.naturalHeight * scale };
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(e.pointerId);
    if (!before) return;
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    if (others.length === 1) {
      // Pinça: a distância entre os dedos muda o zoom.
      const o = others[0]!;
      const d0 = Math.hypot(before.x - o.x, before.y - o.y);
      const d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (d0 > 0) update((c) => ({ ...c, zoom: c.zoom * (d1 / d0) }));
    } else {
      const { w, h } = shown();
      const dx = e.clientX - before.x;
      const dy = e.clientY - before.y;
      update((c) => ({ ...c, cx: c.cx - dx / w, cy: c.cy - dy / h }));
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => pointers.current.delete(e.pointerId);
  const onWheel = (e: WheelEvent<HTMLDivElement>) => update((c) => ({ ...c, zoom: c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }));

  const done = () => {
    const el = img.current;
    if (!el?.naturalWidth) return;
    draw(el, crop, Math.min(OUT, Math.round(region(el, crop).side))).toBlob(
      (blob) => blob && onDone(new File([blob], 'foto.jpg', { type: 'image/jpeg' })),
      'image/jpeg',
      0.92,
    );
  };

  // Posição da foto na área de recorte, a partir do centro e do zoom.
  const { w, h } = shown();
  const side = box.current?.clientWidth ?? 280;
  const style = { width: w, height: h, transform: `translate(${side / 2 - crop.cx * w}px, ${side / 2 - crop.cy * h}px)` };

  return (
    <Sheet open title={t('crop.title')} onClose={onCancel}>
      <p className="cap" style={{ marginTop: -6 }}>
        {t('crop.hint')}
      </p>
      <div ref={box} className={`crop-box crop-${kind}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        {url && (
          <img
            ref={img}
            src={url}
            alt=""
            draggable={false}
            style={style}
            onLoad={() => setCrop((c) => ({ ...c }))}
            onError={() => setError(true)}
          />
        )}
        <span className="crop-mask" aria-hidden="true" />
      </div>
      {error && <p className="errmsg">{t('pay.imageError')}</p>}
      <label className="crop-zoom">
        <span className="cap">{t('crop.zoom')}</span>
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} onChange={(e) => update((c) => ({ ...c, zoom: Number(e.target.value) }))} />
      </label>
      <div>
        <p className="label">{t('crop.previews')}</p>
        <div className="crop-previews">
          {kind === 'profile' ? (
            <>
              <span className="crop-pv">
                <Avatar name={name} color={1} className="xl" src={preview} />
                <span className="cap">{t('crop.pvAccount')}</span>
              </span>
              <span className="crop-pv">
                <Avatar name={name} color={1} size="lg" src={preview} />
                <span className="cap">{t('crop.pvPeople')}</span>
              </span>
              <span className="crop-pv">
                <Avatar name={name} color={1} src={preview} />
                <span className="cap">{t('crop.pvLists')}</span>
              </span>
              <span className="crop-pv">
                <Avatar name={name} color={1} size="sm" src={preview} />
                <span className="cap">{t('crop.pvChips')}</span>
              </span>
            </>
          ) : (
            <>
              <span className="crop-pv">
                <Cover icon={icon ?? { kind: 'icon', name: 'people' }} size="xl" src={preview} />
                <span className="cap">{t('crop.pvCreated')}</span>
              </span>
              <span className="crop-pv">
                <Cover icon={icon ?? { kind: 'icon', name: 'people' }} src={preview} />
                <span className="cap">{t('crop.pvHome')}</span>
              </span>
              <span className="crop-pv">
                <Cover icon={icon ?? { kind: 'icon', name: 'people' }} size="sm" src={preview} />
                <span className="cap">{t('crop.pvHeader')}</span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="sheet-acts">
        <Button block disabled={!url || error} onClick={done}>
          {t('crop.use')}
        </Button>
        <label className="btn btn-g btn-block" style={{ cursor: 'pointer' }}>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && setCurrent(e.target.files[0])} />
          {t('crop.other')}
        </label>
      </div>
    </Sheet>
  );
}
