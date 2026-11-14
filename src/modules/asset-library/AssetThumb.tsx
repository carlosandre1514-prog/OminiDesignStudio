import { useEffect, useState } from 'react';
import { ensureAssetFont } from '@/core/assets/assetUrls';
import type { Asset } from '@/core/assets/types';

const ICON: Record<Asset['kind'], string> = { image: '🖼', vector: '◇', audio: '♪', font: 'Aa', model3d: '◈' };

export function FontSample({ id, text = 'Aa', className }: { id: string; text?: string; className?: string }) {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void ensureAssetFont(id).then((f) => alive && setFamily(f));
    return () => {
      alive = false;
    };
  }, [id]);
  return <span className={className} style={{ fontFamily: family ? `'${family}', sans-serif` : undefined }}>{text}</span>;
}

/** Square preview for a library card. */
export function AssetThumb({ asset }: { asset: Asset }) {
  if (asset.thumbnail)
    return (
      <div className="flex h-full w-full items-center justify-center bg-[repeating-conic-gradient(#1c212c_0%_25%,#161a23_0%_50%)] bg-[length:16px_16px]">
        <img src={asset.thumbnail} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
      </div>
    );
  if (asset.kind === 'font') return <div className="flex h-full w-full items-center justify-center bg-ink-850 text-3xl text-ink-100"><FontSample id={asset.id} /></div>;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-ink-850 text-ink-400">
      <span className="text-3xl">{ICON[asset.kind]}</span>
      <span className="text-[10px] uppercase">{asset.ext}</span>
    </div>
  );
}
