import { safeColor } from '@/core/utils/sanitize';
import { renderableElements } from './layout';
import type { WDScreen } from './model';

/** Render a lightweight raster thumbnail of a screen (boxes, colours and text). */
export function renderScreenThumbnail(screen: WDScreen, width = 320): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const scale = width / screen.width;
  const height = Math.max(1, Math.round(Math.min(screen.height, screen.width * 0.75) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return undefined;
  }
  if (!ctx) return undefined;
  ctx.fillStyle = safeColor(screen.background, '#ffffff');
  ctx.fillRect(0, 0, width, height);
  ctx.scale(scale, scale);
  for (const el of renderableElements(screen)) {
    if (el.initiallyHidden) continue;
    ctx.save();
    ctx.globalAlpha = el.style.opacity;
    const r = el.type === 'ellipse' ? Math.min(el.w, el.h) / 2 : Math.min(el.style.borderRadius, el.w / 2, el.h / 2);
    ctx.beginPath();
    if (el.type === 'ellipse') ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
    else if (typeof ctx.roundRect === 'function') ctx.roundRect(el.x, el.y, el.w, el.h, r);
    else ctx.rect(el.x, el.y, el.w, el.h);
    const fill = safeColor(el.style.fill);
    if (fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (el.style.borderWidth > 0) {
      ctx.lineWidth = el.style.borderWidth;
      ctx.strokeStyle = safeColor(el.style.borderColor, '#000');
      ctx.stroke();
    }
    const label = el.text ?? (el.items ? el.items.join('  ') : '');
    if (label) {
      ctx.fillStyle = safeColor(el.style.textColor, '#111');
      ctx.font = `${el.style.fontWeight} ${el.style.fontSize}px sans-serif`;
      ctx.textBaseline = 'middle';
      const pad = el.style.padding;
      ctx.fillText(label.slice(0, 80), el.x + pad, el.y + (el.type === 'card' || el.type === 'modal' ? pad + el.style.fontSize / 2 : el.h / 2), Math.max(1, el.w - pad * 2));
    }
    ctx.restore();
  }
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
