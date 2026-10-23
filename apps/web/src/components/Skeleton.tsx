import type { CSSProperties } from 'react';

/** Bloco de carregamento; mostrado enquanto a requisição real não volta. */
export function Skeleton({ width, height, radius }: { width: CSSProperties['width']; height: CSSProperties['height']; radius?: CSSProperties['borderRadius'] }) {
  return <span className="sk" aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonCard() {
  return (
    <div className="skcard" aria-hidden="true">
      <Skeleton width={56} height={56} radius={18} />
      <span className="sk-lines">
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
      </span>
      <Skeleton width={74} height={26} radius={999} />
    </div>
  );
}
