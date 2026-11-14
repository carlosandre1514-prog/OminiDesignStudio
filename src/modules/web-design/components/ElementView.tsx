import { useState, type CSSProperties, type MouseEvent } from 'react';
import { safeUrl } from '@/core/utils/sanitize';
import { cssToReact, hoverCss, visualCss, type CssMap } from '../layout';
import type { WDElement } from '../model';

interface Props {
  el: WDElement;
  /** Positioning CSS (absolute box). */
  box: CssMap;
  /** Interactive prototype mode: enables hover state and input typing. */
  interactive?: boolean;
  onActivate?: (el: WDElement) => void;
}

const linkStyle: CSSProperties = { color: 'inherit', textDecoration: 'none', padding: '6px 8px', borderRadius: 4 };

/** Renders an element's real content. Shared by the editor canvas and the prototype preview. */
export function ElementView({ el, box, interactive, onActivate }: Props) {
  const [hover, setHover] = useState(false);
  const hv = interactive && hover ? hoverCss(el) : null;
  const style = cssToReact({ ...box, ...visualCss(el), ...(hv ?? {}) }) as CSSProperties;
  if (!interactive) style.pointerEvents = 'none';
  const handlers = interactive
    ? {
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        onClick: (e: MouseEvent) => {
          if (el.interaction) {
            e.preventDefault();
            e.stopPropagation();
            onActivate?.(el);
          }
        },
      }
    : {};
  if (interactive && el.interaction) style.cursor = 'pointer';

  let content: React.ReactNode = null;
  switch (el.type) {
    case 'text':
    case 'button':
    case 'icon':
      content = el.text;
      break;
    case 'image': {
      const src = safeUrl(el.src);
      content = src ? (
        <img src={src} alt={el.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 12 }}>Imagem</div>
      );
      break;
    }
    case 'input':
      content = interactive ? (
        <input type="text" placeholder={el.placeholder} defaultValue={el.text} aria-label={el.name} style={{ width: '100%', height: '100%', border: 0, outline: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', opacity: el.text ? 1 : 0.5 }}>{el.text || el.placeholder}</div>
      );
      break;
    case 'card':
    case 'modal':
      content = (
        <>
          <h3 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>{el.text}</h3>
          <p style={{ margin: 0, fontSize: '0.8em', fontWeight: 400, opacity: 0.8 }}>{el.subtext}</p>
        </>
      );
      break;
    case 'navbar':
      content = (
        <>
          <strong>{el.text}</strong>
          <nav style={{ display: 'flex', gap: 16 }}>
            {(el.items ?? []).map((item, i) => <a key={i} href="#" onClick={(e) => e.preventDefault()} style={linkStyle}>{item}</a>)}
          </nav>
        </>
      );
      break;
    case 'menu':
      content = (el.items ?? []).map((item, i) => <a key={i} href="#" onClick={(e) => e.preventDefault()} style={linkStyle}>{item}</a>);
      break;
  }
  const Tag = (el.type === 'button' ? 'button' : el.type === 'navbar' ? 'header' : el.type === 'menu' ? 'nav' : el.type === 'modal' ? 'section' : el.type === 'card' ? 'article' : 'div') as 'div';
  return (
    <Tag style={style} data-element-id={el.id} {...handlers} {...(el.type === 'button' ? { type: 'button' } : {})}>
      {content}
    </Tag>
  );
}

export const absBox = (el: WDElement): CssMap => ({ position: 'absolute', left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` });
