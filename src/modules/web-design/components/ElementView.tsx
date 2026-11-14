import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useResolvedSrc } from '@/core/assets/assetUrls';
import { safeUrl } from '@/core/utils/sanitize';
import { resolveConstraintBox } from '../geometry';
import { iconSvg, useIcons } from '../icons';
import { cssToReact, isEffectivelyVisible, stateCss, visualCss, type CssMap } from '../layout';
import type { Transition, WDComponent, WDElement } from '../model';
import { KEYFRAMES } from '../export/tree';

/** Component masters available to instances while rendering. */
export const ComponentsContext = createContext<WDComponent[]>([]);

interface Props {
  el: WDElement;
  /** Positioning CSS (absolute box). */
  box: CssMap;
  /** Interactive prototype mode: enables states, typing and interactions. */
  interactive?: boolean;
  onActivate?: (el: WDElement) => void;
  /** Entry animation (toggle transitions in the prototype). */
  enter?: { transition: Transition; duration: number } | null;
  depth?: number;
}

const linkStyle: CSSProperties = { color: 'inherit', textDecoration: 'none', padding: '6px 8px', borderRadius: 4 };

/** Parse a KEYFRAMES "from { a: b; c: d; }" rule into a Web Animations keyframe. */
function fromKeyframe(t: Exclude<Transition, 'none'>): Keyframe {
  const body = KEYFRAMES[t].replace(/^from\s*\{|\}\s*$/g, '');
  const k: Record<string, string> = {};
  for (const decl of body.split(';')) {
    const [p, v] = decl.split(':').map((x) => x?.trim());
    if (p && v) k[p] = v;
  }
  return k as Keyframe;
}

export function playEnter(node: HTMLElement | null, t: Transition | undefined, duration = 300) {
  if (!node || !t || t === 'none' || typeof node.animate !== 'function') return;
  if (document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  node.animate([fromKeyframe(t), {}], { duration, easing: 'ease', fill: 'both' });
}

function InstanceChildren({ el, interactive, onActivate, depth }: { el: WDElement; interactive?: boolean; onActivate?: (el: WDElement) => void; depth: number }) {
  const components = useContext(ComponentsContext);
  const comp = components.find((c) => c.id === el.componentId);
  if (!comp || depth > 8) return null;
  return (
    <>
      {comp.elements
        .filter((c) => c.type !== 'group' && isEffectivelyVisible(comp, c))
        .map((c) => {
          const text = el.textOverrides?.[c.id];
          const child = text !== undefined ? { ...c, text } : c;
          const r = resolveConstraintBox(c, comp.width, comp.height, el.w, el.h);
          return (
            <ElementView
              key={c.id}
              el={child}
              box={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }}
              interactive={interactive}
              onActivate={onActivate}
              depth={depth + 1}
            />
          );
        })}
    </>
  );
}

/** Renders an element's real content. Shared by the editor canvas and the prototype preview. */
export function ElementView({ el, box, interactive, onActivate, enter, depth = 0 }: Props) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const resolved = useResolvedSrc(el.type === 'image' ? el.src : undefined);
  const icons = useIcons(el.type === 'icon' && !!el.iconName);

  useLayoutEffect(() => {
    if (enter) playEnter(ref.current, enter.transition, enter.duration);
    // play once when mounted (element shown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = interactive && !el.disabled;
  const state: CssMap = {
    ...(live && hover ? stateCss(el, 'hover') : null),
    ...(live && focused ? stateCss(el, 'focus') : null),
    ...(live && pressed ? stateCss(el, 'pressed') : null),
  };
  const css: CssMap = { ...box, ...visualCss(el), ...state };
  if (el.type === 'instance') css.overflow = 'hidden';
  const style = cssToReact(css) as CSSProperties;
  if (!interactive) style.pointerEvents = 'none';
  const handlers = interactive
    ? {
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => {
          setHover(false);
          setPressed(false);
        },
        onPointerDown: () => setPressed(true),
        onPointerUp: () => setPressed(false),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        onClick: (e: MouseEvent) => {
          if (el.interaction && !el.disabled) {
            e.preventDefault();
            e.stopPropagation();
            onActivate?.(el);
          }
        },
      }
    : {};
  if (live && el.interaction) style.cursor = 'pointer';

  let content: React.ReactNode = null;
  switch (el.type) {
    case 'icon': {
      const svg = el.iconName ? iconSvg(el.iconName, icons) : '';
      // Markup is generated from trusted vector data with whitelisted, escaped attributes (see icons.ts).
      content = svg ? <span style={{ display: 'block', width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} /> : el.iconName ? null : el.text;
      break;
    }
    case 'text':
    case 'button':
      content = el.text;
      break;
    case 'image': {
      const src = safeUrl(resolved.url);
      content = resolved.missing ? (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#b91c1c', fontSize: 12, textAlign: 'center' }}>Asset ausente na biblioteca</div>
      ) : src ? (
        <img src={src} alt={el.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 12 }}>Imagem</div>
      );
      break;
    }
    case 'input':
      content = interactive ? (
        <input type="text" placeholder={el.placeholder} defaultValue={el.text} aria-label={el.name} disabled={el.disabled} style={{ width: '100%', height: '100%', border: 0, outline: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} />
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
    case 'instance':
      content = <InstanceChildren el={el} interactive={interactive} onActivate={onActivate} depth={depth} />;
      break;
  }
  const Tag = (el.type === 'button' ? 'button' : el.type === 'navbar' ? 'header' : el.type === 'menu' ? 'nav' : el.type === 'modal' ? 'section' : el.type === 'card' ? 'article' : 'div') as 'div';
  return (
    <Tag ref={ref} style={style} data-element-id={el.id} {...handlers} {...(el.type === 'button' ? { type: 'button', disabled: el.disabled && interactive } : {})}>
      {content}
    </Tag>
  );
}

export const absBox = (el: Pick<WDElement, 'x' | 'y' | 'w' | 'h'>): CssMap => ({ position: 'absolute', left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` });
