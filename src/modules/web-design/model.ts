import { createId } from '@/core/utils/id';

export type ElementType =
  | 'frame'
  | 'ellipse'
  | 'text'
  | 'button'
  | 'image'
  | 'icon'
  | 'input'
  | 'card'
  | 'navbar'
  | 'menu'
  | 'modal'
  | 'group';

export type ConstraintH = 'left' | 'right' | 'center' | 'stretch' | 'scale';
export type ConstraintV = 'top' | 'bottom' | 'center' | 'stretch' | 'scale';

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

export interface WDStyle {
  fill: string;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right';
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  shadow: Shadow | null;
  opacity: number;
  padding: number;
}

export type HoverStyle = Partial<Pick<WDStyle, 'fill' | 'textColor' | 'borderColor'>>;

export type Interaction =
  | { type: 'navigate'; screenId: string }
  | { type: 'toggle'; targetId: string }
  | { type: 'url'; href: string };

export interface WDElement {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  /** Hidden when the prototype loads; can be shown through a "toggle" interaction (modals, menus). */
  initiallyHidden: boolean;
  constraintH: ConstraintH;
  constraintV: ConstraintV;
  style: WDStyle;
  hover: HoverStyle | null;
  interaction: Interaction | null;
  text?: string;
  subtext?: string;
  src?: string;
  placeholder?: string;
  items?: string[];
}

export interface WDScreen {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  elements: WDElement[];
  guides: { x: number[]; y: number[] };
}

export interface GridSettings {
  size: number;
  show: boolean;
  snap: boolean;
}

export interface WebDesignDoc {
  version: 1;
  screens: WDScreen[];
  grid: GridSettings;
}

export const DEFAULT_STYLE: WDStyle = {
  fill: '#ffffff',
  textColor: '#111827',
  fontSize: 16,
  fontWeight: 400,
  fontFamily: 'Inter, system-ui, sans-serif',
  textAlign: 'left',
  borderWidth: 0,
  borderColor: '#d1d5db',
  borderRadius: 0,
  shadow: null,
  opacity: 1,
  padding: 0,
};

export const ELEMENT_LABELS: Record<ElementType, string> = {
  frame: 'Painel',
  ellipse: 'Elipse',
  text: 'Texto',
  button: 'Botão',
  image: 'Imagem',
  icon: 'Ícone',
  input: 'Input',
  card: 'Card',
  navbar: 'Barra de navegação',
  menu: 'Menu',
  modal: 'Modal',
  group: 'Grupo',
};

export const INSERTABLE: ElementType[] = ['frame', 'ellipse', 'text', 'button', 'image', 'icon', 'input', 'card', 'navbar', 'menu', 'modal'];

const softShadow: Shadow = { x: 0, y: 4, blur: 16, spread: 0, color: 'rgba(0,0,0,0.12)' };

export function createElement(type: ElementType, x: number, y: number, overrides: Partial<WDElement> = {}): WDElement {
  const base: WDElement = {
    id: createId('el'),
    type,
    name: ELEMENT_LABELS[type],
    x,
    y,
    w: 160,
    h: 100,
    parentId: null,
    visible: true,
    locked: false,
    initiallyHidden: false,
    constraintH: 'left',
    constraintV: 'top',
    style: { ...DEFAULT_STYLE },
    hover: null,
    interaction: null,
  };
  switch (type) {
    case 'frame':
      Object.assign(base, { w: 240, h: 160 });
      base.style = { ...base.style, fill: '#f3f4f6', borderRadius: 8 };
      break;
    case 'ellipse':
      Object.assign(base, { w: 120, h: 120 });
      base.style = { ...base.style, fill: '#a78bfa', borderRadius: 9999 };
      break;
    case 'text':
      Object.assign(base, { w: 240, h: 32, text: 'Texto' });
      base.style = { ...base.style, fill: 'transparent', fontSize: 20 };
      break;
    case 'button':
      Object.assign(base, { w: 140, h: 44, text: 'Botão' });
      base.style = { ...base.style, fill: '#6d28d9', textColor: '#ffffff', borderRadius: 8, fontWeight: 600, textAlign: 'center' };
      base.hover = { fill: '#5b21b6' };
      break;
    case 'image':
      Object.assign(base, { w: 240, h: 160, src: '' });
      base.style = { ...base.style, fill: '#e5e7eb', borderRadius: 8 };
      break;
    case 'icon':
      Object.assign(base, { w: 40, h: 40, text: '★' });
      base.style = { ...base.style, fill: 'transparent', textColor: '#6d28d9', fontSize: 28, textAlign: 'center' };
      break;
    case 'input':
      Object.assign(base, { w: 260, h: 44, placeholder: 'Digite aqui…', text: '' });
      base.style = { ...base.style, borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 15 };
      break;
    case 'card':
      Object.assign(base, { w: 280, h: 180, text: 'Título do card', subtext: 'Descrição do card.' });
      base.style = { ...base.style, borderRadius: 12, padding: 20, shadow: softShadow, fontSize: 18, fontWeight: 600 };
      break;
    case 'navbar':
      Object.assign(base, { w: 1280, h: 64, text: 'Marca', items: ['Início', 'Sobre', 'Contato'] });
      base.style = { ...base.style, fill: '#111827', textColor: '#ffffff', padding: 24, fontWeight: 500 };
      base.constraintH = 'stretch';
      break;
    case 'menu':
      Object.assign(base, { w: 200, h: 144, items: ['Item 1', 'Item 2', 'Item 3'] });
      base.style = { ...base.style, borderRadius: 8, padding: 12, shadow: softShadow, borderWidth: 1, borderColor: '#e5e7eb' };
      break;
    case 'modal':
      Object.assign(base, { w: 420, h: 260, text: 'Título do modal', subtext: 'Conteúdo do modal.', initiallyHidden: true });
      base.style = { ...base.style, borderRadius: 16, padding: 24, shadow: { x: 0, y: 20, blur: 48, spread: 0, color: 'rgba(0,0,0,0.25)' }, fontSize: 20, fontWeight: 600 };
      base.constraintH = 'center';
      base.constraintV = 'center';
      break;
    case 'group':
      base.style = { ...base.style, fill: 'transparent' };
      break;
  }
  return { ...base, ...overrides, style: { ...base.style, ...(overrides.style ?? {}) } };
}

export function createScreen(name = 'Tela 1', width = 1280, height = 800): WDScreen {
  return { id: createId('scr'), name, width, height, background: '#ffffff', elements: [], guides: { x: [], y: [] } };
}

export function createEmptyDoc(width = 1280, height = 800, grid?: Partial<GridSettings>): WebDesignDoc {
  return { version: 1, screens: [createScreen('Tela 1', width, height)], grid: { size: 8, show: true, snap: true, ...grid } };
}

/** Validate and repair data loaded from storage. Unknown/corrupt parts are dropped instead of crashing. */
export function normalizeDoc(raw: unknown): WebDesignDoc {
  if (!raw || typeof raw !== 'object') return createEmptyDoc();
  const r = raw as Partial<WebDesignDoc>;
  const screens = Array.isArray(r.screens)
    ? r.screens.filter((s): s is WDScreen => !!s && typeof s === 'object' && typeof s.id === 'string')
    : [];
  const fixed = screens.map((s) => ({
    id: s.id,
    name: typeof s.name === 'string' ? s.name : 'Tela',
    width: Number(s.width) > 0 ? Number(s.width) : 1280,
    height: Number(s.height) > 0 ? Number(s.height) : 800,
    background: typeof s.background === 'string' ? s.background : '#ffffff',
    guides: { x: Array.isArray(s.guides?.x) ? s.guides.x.filter(Number.isFinite) : [], y: Array.isArray(s.guides?.y) ? s.guides.y.filter(Number.isFinite) : [] },
    elements: (Array.isArray(s.elements) ? s.elements : [])
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.type === 'string' && e.type in ELEMENT_LABELS)
      .map((e) => {
        const d = createElement(e.type, 0, 0);
        return { ...d, ...e, style: { ...d.style, ...(e.style ?? {}) } };
      }),
  }));
  const ids = new Set(fixed.flatMap((s) => s.elements.map((e) => e.id)));
  for (const s of fixed) for (const e of s.elements) if (e.parentId && !ids.has(e.parentId)) e.parentId = null;
  return {
    version: 1,
    screens: fixed.length ? fixed : [createScreen()],
    grid: {
      size: Number(r.grid?.size) > 0 ? Number(r.grid?.size) : 8,
      show: r.grid?.show ?? true,
      snap: r.grid?.snap ?? true,
    },
  };
}
