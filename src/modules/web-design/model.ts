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
  | 'group'
  /** Instance of a reusable component (master lives in doc.components). */
  | 'instance';

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

export type Transition = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom';

export const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'none', label: 'Instantânea' },
  { id: 'fade', label: 'Dissolver' },
  { id: 'slide-left', label: 'Deslizar ←' },
  { id: 'slide-right', label: 'Deslizar →' },
  { id: 'slide-up', label: 'Deslizar ↑' },
  { id: 'slide-down', label: 'Deslizar ↓' },
  { id: 'zoom', label: 'Zoom' },
];

export type Interaction =
  | { type: 'navigate'; screenId: string; transition?: Transition; duration?: number }
  | { type: 'toggle'; targetId: string; transition?: Transition; duration?: number }
  | { type: 'url'; href: string };

/** Per-breakpoint manual adjustments (desktop-first or mobile-first media queries). */
export interface ElementOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  visible?: boolean;
  fontSize?: number;
}

export interface Breakpoint {
  id: string;
  name: string;
  /** "max" = applies at widths <= width; "min" = applies at widths >= width. */
  mode: 'max' | 'min';
  width: number;
  /** Frame width used to edit and preview the breakpoint. */
  previewWidth: number;
}

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
  /** Style while pressed (:active). */
  pressed: HoverStyle | null;
  /** Style while focused (:focus-within), mainly for inputs. */
  focus: HoverStyle | null;
  /** Disabled state: no interactions, reduced opacity, native disabled attribute. */
  disabled: boolean;
  /** Rotation in degrees around the element centre. */
  rotation: number;
  interaction: Interaction | null;
  /** Built-in icon name (Lucide set) for "icon" elements; falls back to the text glyph. */
  iconName?: string;
  /** For "instance" elements. */
  componentId?: string;
  /** Instance text overrides keyed by the component child id. */
  textOverrides?: Record<string, string>;
  /** Manual adjustments keyed by breakpoint id. */
  overrides?: Record<string, ElementOverride>;
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

/** A reusable component master. Same shape as a screen (its own frame and elements). */
export type WDComponent = WDScreen;

export interface WebDesignDoc {
  version: 1;
  screens: WDScreen[];
  components: WDComponent[];
  breakpoints: Breakpoint[];
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
  instance: 'Instância',
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
    pressed: null,
    focus: null,
    disabled: false,
    rotation: 0,
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
    case 'instance':
      base.style = { ...base.style, fill: 'transparent' };
      break;
  }
  return { ...base, ...overrides, style: { ...base.style, ...(overrides.style ?? {}) } };
}

export function createScreen(name = 'Tela 1', width = 1280, height = 800): WDScreen {
  return { id: createId('scr'), name, width, height, background: '#ffffff', elements: [], guides: { x: [], y: [] } };
}

/** Default breakpoints: desktop-first for wide designs, mobile-first for narrow ones. */
export function defaultBreakpoints(designWidth: number): Breakpoint[] {
  return designWidth >= 900
    ? [
        { id: 'bp-tablet', name: 'Tablet', mode: 'max', width: 1023, previewWidth: 820 },
        { id: 'bp-mobile', name: 'Celular', mode: 'max', width: 639, previewWidth: 390 },
      ]
    : [
        { id: 'bp-tablet', name: 'Tablet', mode: 'min', width: 640, previewWidth: 820 },
        { id: 'bp-desktop', name: 'Desktop', mode: 'min', width: 1024, previewWidth: 1440 },
      ];
}

export function createEmptyDoc(width = 1280, height = 800, grid?: Partial<GridSettings>): WebDesignDoc {
  return {
    version: 1,
    screens: [createScreen('Tela 1', width, height)],
    components: [],
    breakpoints: defaultBreakpoints(width),
    grid: { size: 8, show: true, snap: true, ...grid },
  };
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function normalizeFrame(s: WDScreen): WDScreen {
  return {
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
        const el: WDElement = { ...d, ...e, style: { ...d.style, ...(e.style ?? {}) } };
        el.rotation = num(e.rotation, 0);
        el.pressed = e.pressed ?? null;
        el.focus = e.focus ?? null;
        el.disabled = !!e.disabled;
        if (e.overrides && typeof e.overrides !== 'object') delete el.overrides;
        return el;
      }),
  };
}

const isFrame = (s: unknown): s is WDScreen => !!s && typeof s === 'object' && typeof (s as WDScreen).id === 'string';

/** Validate and repair data loaded from storage. Unknown/corrupt parts are dropped instead of crashing. */
export function normalizeDoc(raw: unknown): WebDesignDoc {
  if (!raw || typeof raw !== 'object') return createEmptyDoc();
  const r = raw as Partial<WebDesignDoc>;
  const fixed = (Array.isArray(r.screens) ? r.screens.filter(isFrame) : []).map(normalizeFrame);
  const components = (Array.isArray(r.components) ? r.components.filter(isFrame) : []).map(normalizeFrame);
  const compIds = new Set(components.map((c) => c.id));
  for (const frame of [...fixed, ...components]) {
    const ids = new Set(frame.elements.map((e) => e.id));
    for (const e of frame.elements) if (e.parentId && !ids.has(e.parentId)) e.parentId = null;
    // Instances of missing components (or nested in their own master) are dropped.
    frame.elements = frame.elements.filter((e) => e.type !== 'instance' || (!!e.componentId && compIds.has(e.componentId) && e.componentId !== frame.id));
  }
  const screens = fixed.length ? fixed : [createScreen()];
  const breakpoints = Array.isArray(r.breakpoints)
    ? r.breakpoints
        .filter((b) => b && typeof b.id === 'string' && (b.mode === 'max' || b.mode === 'min') && Number(b.width) > 0)
        .map((b) => ({ id: b.id, name: typeof b.name === 'string' ? b.name : 'Breakpoint', mode: b.mode, width: Number(b.width), previewWidth: Number(b.previewWidth) > 0 ? Number(b.previewWidth) : Number(b.width) }))
    : defaultBreakpoints(screens[0].width);
  return {
    version: 1,
    screens,
    components,
    breakpoints,
    grid: {
      size: Number(r.grid?.size) > 0 ? Number(r.grid?.size) : 8,
      show: r.grid?.show ?? true,
      snap: r.grid?.snap ?? true,
    },
  };
}
