import { useEffect, useRef, useState } from 'react';
import { MAP_LABELS } from '../engine/compose';
import { selectDoc, useTextures, type MapView } from '../store';
import { canPaint, strokeEnd, strokeMove, strokeStart } from './painting';

const VIEWS: MapView[] = ['baseColor', 'normal', 'roughness', 'metallic', 'height', 'ao', 'emissive'];

/** Flat view of one map (optionally tiled 2×2 to check seams). Paint directly when a paint layer is selected. */
export function Preview2D() {
  const maps = useTextures((s) => s.preview);
  const mapView = useTextures((s) => s.mapView);
  const tile = useTextures((s) => s.tile2d);
  const brush = useTextures((s) => s.brush);
  useTextures(selectDoc); // re-render when the selected layer/mask changes
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const paintable = canPaint();

  useEffect(() => {
    const c = canvas.current;
    if (!c || !maps) return;
    const src = document.createElement('canvas');
    src.width = maps.size;
    src.height = maps.size;
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(maps[mapView]), maps.size, maps.size), 0, 0);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, c.width, c.height);
    const n = tile ? 2 : 1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) ctx.drawImage(src, (x * c.width) / n, (y * c.height) / n, c.width / n, c.height / n);
  }, [maps, mapView, tile]);

  const uv = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const n = tile ? 2 : 1;
    return [((e.clientX - r.left) / r.width) * n, ((e.clientY - r.top) / r.height) * n] as const;
  };

  return (
    <div className="flex h-full flex-col" data-testid="texture-preview-2d">
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-800 p-1.5">
        {VIEWS.map((v) => (
          <button key={v} className={`rounded px-2 py-1 text-[11px] ${mapView === v ? 'bg-accent-500 text-white' : 'text-ink-300 hover:bg-ink-800'}`} onClick={() => useTextures.getState().set({ mapView: v })}>
            {MAP_LABELS[v]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-ink-300">
          <input type="checkbox" checked={tile} onChange={(e) => useTextures.getState().set({ tile2d: e.target.checked })} /> Repetir 2×2
        </label>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#20242c_0%_25%,#191c22_0%_50%)] bg-[length:20px_20px] p-3">
        <div className="relative aspect-square h-full max-h-full max-w-full">
          <canvas
            ref={canvas}
            width={1024}
            height={1024}
            className={`h-full w-full touch-none rounded shadow-xl ${paintable ? 'cursor-none' : ''}`}
            data-testid="texture-canvas-2d"
            onPointerDown={(e) => {
              if (!paintable) return;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              const [u, v] = uv(e);
              strokeStart(u, v);
            }}
            onPointerMove={(e) => {
              const r = canvas.current!.getBoundingClientRect();
              setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
              if (paintable && e.buttons) {
                const [u, v] = uv(e);
                strokeMove(u, v);
              }
            }}
            onPointerUp={() => strokeEnd()}
            onPointerCancel={() => strokeEnd()}
            onPointerLeave={() => setCursor(null)}
          />
          {paintable && cursor && canvas.current && (
            <div
              className="pointer-events-none absolute rounded-full border border-white/80 mix-blend-difference"
              style={{
                left: cursor.x,
                top: cursor.y,
                width: (brush.size * canvas.current.clientWidth) / (tile ? 2 : 1),
                height: (brush.size * canvas.current.clientWidth) / (tile ? 2 : 1),
                transform: 'translate(-50%, -50%)',
              }}
            />
          )}
          {!maps && <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-400">Gerando…</div>}
        </div>
      </div>
    </div>
  );
}
