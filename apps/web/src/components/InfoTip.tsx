import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const GAP = 8;
const WIDTH = 260;

/**
 * "?" com uma explicação curta. No celular, tocar abre o balão e tocar fora fecha; no computador,
 * abre também ao passar o mouse. O texto fica sempre ligado ao botão para leitores de tela.
 * O balão se posiciona dentro da tela (nunca causa rolagem para o lado).
 */
export function InfoTip({ label, text, inline }: { label: string; text: ReactNode; /** Dentro de um texto: do tamanho da letra, sem passar da altura da linha. */ inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // Aberto pelo mouse: o clique não fecha (fecharia logo depois de abrir).
  const hovered = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(WIDTH, window.innerWidth - 2 * GAP);
      const left = Math.min(Math.max(GAP, r.left + r.width / 2 - width / 2), window.innerWidth - width - GAP);
      setStyle({ position: 'fixed', top: r.bottom + 6, left, width });
    }
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <span
      ref={box}
      className={inline ? 'infotip inline' : 'infotip'}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        hovered.current = true;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        hovered.current = false;
        setOpen(false);
      }}
    >
      <button ref={btn} type="button" className="infotip-btn" aria-label={label} aria-expanded={open} aria-describedby={id} onClick={() => setOpen((o) => hovered.current || !o)}>
        ?
      </button>
      <span id={id} role="tooltip" className={open ? 'infotip-bubble' : 'sr-only'} style={open ? style : undefined}>
        {text}
      </span>
    </span>
  );
}
