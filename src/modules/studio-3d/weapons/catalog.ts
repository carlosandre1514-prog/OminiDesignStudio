import * as B from '../mesh/builders';
import { T, place } from '../mesh/builders';
import * as P from '../mesh/polyMesh';

/** Material slot of a part; the finish chosen by the user decides the actual texture. */
export type Slot = 'blade' | 'metal' | 'dark' | 'trim' | 'wood' | 'grip' | 'polymer' | 'string' | 'fletch' | 'glow' | 'crystal';

export interface WeaponPart {
  name: string;
  mesh: P.PolyMesh;
  slot: Slot;
  shading?: 'flat' | 'auto' | 'smooth';
}

export type Category = 'melee' | 'firearm' | 'ranged' | 'scifi';

export const CATEGORY_LABELS: Record<Category, string> = {
  melee: 'Brancas / medievais',
  firearm: 'Armas de fogo',
  ranged: 'Arco e flecha',
  scifi: 'Sci-fi / fantasia',
};

export interface NumParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** unit shown in the UI */
  unit?: string;
}

export interface ChoiceParam {
  key: string;
  label: string;
  options: { id: string; label: string }[];
  value: string;
}

export type Params = Record<string, number | string>;

export interface WeaponType {
  id: string;
  name: string;
  category: Category;
  description: string;
  nums: NumParam[];
  choices: ChoiceParam[];
  build(p: Params, r: ReturnType<typeof B.rng>): WeaponPart[];
}

const n = (p: Params, k: string) => Number(p[k]);
const s = (p: Params, k: string) => String(p[k]);
const num = (key: string, label: string, min: number, max: number, value: number, step = 0.01, unit = 'm'): NumParam => ({ key, label, min, max, step, value, unit });
const choice = (key: string, label: string, options: [string, string][], value?: string): ChoiceParam => ({ key, label, options: options.map(([id, l]) => ({ id, label: l })), value: value ?? options[0][0] });
const yes = (p: Params, k: string) => s(p, k) === 'sim';
const YESNO: [string, string][] = [['sim', 'Sim'], ['nao', 'Não']];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- shared parts

interface BladeOpts {
  length: number;
  width: number;
  /** width at the start of the tip, relative to the base width */
  taper: number;
  thickness: number;
  tipStart?: number;
  fuller?: boolean;
  singleEdge?: boolean;
  /** lateral offset of the blade centre line, as a function of t (0 base … 1 tip) */
  curve?: (t: number) => number;
  stations?: number;
}

/** Lofted blade with real cross-sections: diamond/lenticular, optional fuller, or single-edged (katana-like). */
export function blade(o: BladeOpts): P.PolyMesh {
  const N = o.stations ?? 28;
  const tipStart = o.tipStart ?? 0.84;
  const sections: P.Vec3[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = t * o.length;
    let w = o.width * lerp(1, o.taper, Math.min(1, t / tipStart));
    let th = o.thickness * lerp(1, 0.55, t);
    if (t > tipStart) {
      const k = (t - tipStart) / (1 - tipStart);
      const f = Math.cos((k * Math.PI) / 2);
      w *= f;
      th *= Math.max(f, 0);
    }
    if (i === N) {
      w = 0;
      th = 0;
    }
    const xo = o.curve ? o.curve(t) : 0;
    let pts: [number, number][];
    if (o.singleEdge) {
      const shift = t > tipStart ? -((t - tipStart) / (1 - tipStart)) * o.width * 0.35 : 0;
      pts = [
        [w, 0],
        [0.1 * w, th],
        [-w, th * 0.8],
        [-w * 1.04, 0],
        [-w, -th * 0.8],
        [0.1 * w, -th],
      ].map(([x, z]) => [x + shift, z] as [number, number]);
    } else {
      const g = o.fuller ? lerp(0.45, 1, Math.min(1, Math.max(0, (t - 0.55) / 0.2))) : 1;
      pts = [
        [w, 0],
        [0.5 * w, th],
        [0.16 * w, th * g],
        [-0.16 * w, th * g],
        [-0.5 * w, th],
        [-w, 0],
        [-0.5 * w, -th],
        [-0.16 * w, -th * g],
        [0.16 * w, -th * g],
        [0.5 * w, -th],
      ];
    }
    sections.push(pts.map(([x, z]) => [x + xo, y, z] as P.Vec3));
  }
  return B.loft(sections);
}

const pommel = (style: string, r: number): P.PolyMesh => {
  if (style === 'disco')
    return B.lathe([[0, -r * 0.5], [r * 0.6, -r * 0.48], [r, -r * 0.3], [r, r * 0.3], [r * 0.6, r * 0.48], [0, r * 0.5]], 32);
  if (style === 'facetado') return B.lathe([[0, -r], [r * 0.7, -r * 0.6], [r, 0], [r * 0.7, r * 0.6], [0, r]], 8);
  return B.lathe(Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    return [Math.cos(a) * r, Math.sin(a) * r] as B.V2;
  }), 24);
};

/** Grip along -Y (from 0 down to -len), slightly swollen in the middle. */
const grip = (len: number, r: number, oval = 1): P.PolyMesh =>
  place(
    B.lathe([[r * 0.92, -len], [r * 1.05, -len * 0.75], [r * 1.1, -len * 0.5], [r * 1.05, -len * 0.25], [r * 0.92, 0]], 20),
    T.s(1, 1, oval),
  );

/** Tube along a polyline with constant radius. */
const rod = (from: P.Vec3, to: P.Vec3, r: number, sides = 12) => B.tube([from, to], () => r, sides);

/** Wedge an extruded head toward its cutting edge (x from x0 to x1). */
const sharpen = (m: P.PolyMesh, x0: number, x1: number, edge = 0.12): P.PolyMesh =>
  P.transformVertices(m, Array.from({ length: P.vcount(m) }, (_, i) => i), ([x, y, z]) => {
    const k = Math.min(1, Math.max(0, (Math.abs(x) - x0) / (x1 - x0)));
    return [x, y, z * lerp(1, edge, k * k)];
  });

/** Bend a flat mesh so it curves (shields): z += k·x². */
const bow = (m: P.PolyMesh, k: number) => P.transformVertices(m, Array.from({ length: P.vcount(m) }, (_, i) => i), ([x, y, z]) => [x, y, z - k * x * x]);

const arc = (r: number, a0: number, a1: number, steps = 16): B.V2[] => Array.from({ length: steps + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / steps;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

// ---------------------------------------------------------------- melee

function swordParts(p: Params, kind: 'long' | 'dagger'): WeaponPart[] {
  const L = n(p, 'blade');
  const W = n(p, 'width');
  const parts: WeaponPart[] = [
    { name: 'Lâmina', slot: 'blade', mesh: place(blade({ length: L, width: W / 2, taper: n(p, 'taper'), thickness: W * 0.11, fuller: yes(p, 'fuller') }), T.at(0, 0.012, 0)) },
  ];
  const gw = n(p, 'guard');
  const style = s(p, 'guardStyle');
  if (style === 'reta') parts.push({ name: 'Guarda', slot: 'trim', mesh: place(B.roundedBox(gw, 0.022, 0.03, 0.006), T.at(0, 0, 0)) });
  else {
    const curve = style === 'curvada' ? 0.03 : 0.0;
    const path: P.Vec3[] = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16 - 0.5;
      const y = style === 'curvada' ? curve * (4 * t * t) * Math.sign(1) : Math.sin(t * Math.PI * 2) * 0.02;
      return [t * gw, y, 0];
    });
    parts.push({ name: 'Guarda', slot: 'trim', mesh: B.tube(path, (t) => 0.011 + 0.006 * Math.sin(t * Math.PI), 10) });
    parts.push({ name: 'Centro da guarda', slot: 'trim', mesh: B.roundedBox(0.045, 0.03, 0.034, 0.008) });
  }
  const gl = n(p, 'grip');
  parts.push({ name: 'Empunhadura', slot: 'grip', mesh: place(grip(gl, kind === 'dagger' ? 0.012 : 0.015, 0.85), T.at(0, -0.011, 0)) });
  const pr = kind === 'dagger' ? 0.018 : 0.026;
  parts.push({ name: 'Pomo', slot: 'trim', mesh: place(pommel(s(p, 'pommel'), pr), T.at(0, -0.011 - gl - pr * 0.6, 0)) });
  return parts;
}

const longsword: WeaponType = {
  id: 'longsword',
  name: 'Espada longa',
  category: 'melee',
  description: 'Lâmina reta de dois gumes, guarda em cruz e pomo.',
  nums: [num('blade', 'Comprimento da lâmina', 0.6, 1.1, 0.9), num('width', 'Largura da lâmina', 0.03, 0.07, 0.048, 0.002), num('taper', 'Afinamento', 0.3, 1, 0.6, 0.02, ''), num('guard', 'Largura da guarda', 0.14, 0.32, 0.22), num('grip', 'Comprimento do cabo', 0.12, 0.3, 0.2)],
  choices: [choice('fuller', 'Sulco (fuller)', YESNO), choice('guardStyle', 'Guarda', [['reta', 'Reta'], ['curvada', 'Curvada'], ['s', 'Em S']]), choice('pommel', 'Pomo', [['esfera', 'Esférico'], ['disco', 'Disco'], ['facetado', 'Facetado']])],
  build: (p) => swordParts(p, 'long'),
};

const dagger: WeaponType = {
  id: 'dagger',
  name: 'Adaga',
  category: 'melee',
  description: 'Lâmina curta de dois gumes.',
  nums: [num('blade', 'Comprimento da lâmina', 0.15, 0.35, 0.24), num('width', 'Largura da lâmina', 0.02, 0.05, 0.034, 0.002), num('taper', 'Afinamento', 0.2, 1, 0.45, 0.02, ''), num('guard', 'Largura da guarda', 0.06, 0.14, 0.09), num('grip', 'Comprimento do cabo', 0.08, 0.14, 0.1)],
  choices: [choice('fuller', 'Sulco (fuller)', YESNO, 'nao'), choice('guardStyle', 'Guarda', [['reta', 'Reta'], ['curvada', 'Curvada'], ['s', 'Em S']]), choice('pommel', 'Pomo', [['esfera', 'Esférico'], ['disco', 'Disco'], ['facetado', 'Facetado']], 'disco')],
  build: (p) => swordParts(p, 'dagger'),
};

const katana: WeaponType = {
  id: 'katana',
  name: 'Katana',
  category: 'melee',
  description: 'Lâmina curva de um gume, tsuba e cabo trançado.',
  nums: [num('blade', 'Comprimento da lâmina', 0.6, 0.8, 0.7), num('width', 'Largura', 0.026, 0.038, 0.031, 0.001), num('curve', 'Curvatura (sori)', 0, 0.035, 0.018, 0.001), num('grip', 'Comprimento do cabo', 0.22, 0.32, 0.26), num('tsuba', 'Diâmetro da tsuba', 0.06, 0.09, 0.075)],
  choices: [choice('tsubaStyle', 'Tsuba', [['redonda', 'Redonda'], ['quadrada', 'Quadrada arredondada'], ['vazada', 'Vazada']])],
  build(p) {
    const L = n(p, 'blade');
    const sori = n(p, 'curve');
    const curve = (t: number) => -sori * t * t * (L / 0.7);
    const parts: WeaponPart[] = [
      { name: 'Lâmina', slot: 'blade', mesh: place(blade({ length: L, width: n(p, 'width') / 2, taper: 0.75, thickness: 0.0035, singleEdge: true, curve, tipStart: 0.9, stations: 34 }), T.at(0, 0.03, 0)) },
      { name: 'Habaki', slot: 'trim', mesh: place(B.roundedBox(0.034, 0.03, 0.012, 0.003), T.at(-0.002, 0.016, 0)) },
    ];
    const D = n(p, 'tsuba') / 2;
    const st = s(p, 'tsubaStyle');
    const outline: B.V2[] =
      st === 'quadrada'
        ? arc(1, 0, Math.PI * 2, 40).slice(0, -1).map(([x, y]) => {
            const k = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(y), 4), -0.25);
            return [x * k * D, y * k * D * 0.92];
          })
        : arc(D, 0, Math.PI * 2, 40).slice(0, -1);
    const holes: B.V2[][] = [[[-0.016, -0.005], [0.016, -0.005], [0.016, 0.005], [-0.016, 0.005]]];
    if (st === 'vazada') for (const sy of [1, -1]) holes.push(arc(D * 0.22, 0, Math.PI * 2, 12).slice(0, -1).map(([x, y]) => [x, y + sy * D * 0.6] as B.V2));
    parts.push({ name: 'Tsuba', slot: 'dark', mesh: place(B.extrude(outline, 0.006, holes), T.rx(-Math.PI / 2)) });
    const gl = n(p, 'grip');
    parts.push({ name: 'Tsuka (cabo)', slot: 'grip', mesh: place(B.lathe([[0.0125, -gl], [0.0135, -gl * 0.5], [0.013, 0]], 16), T.s(1.25, 1, 0.85), T.at(0, -0.004, 0)) });
    parts.push({ name: 'Fuchi', slot: 'trim', mesh: place(B.lathe([[0.0165, -0.012], [0.0165, 0]], 16), T.s(1.2, 1, 0.85), T.at(0, -0.003, 0)) });
    parts.push({ name: 'Kashira', slot: 'trim', mesh: place(B.lathe([[0.0165, 0], [0.0165, 0.012], [0.01, 0.018], [0, 0.019]], 16), T.s(1.2, 1, 0.85), T.at(0, -gl - 0.016, 0)) });
    return parts;
  },
};

const axe: WeaponType = {
  id: 'axe',
  name: 'Machado',
  category: 'melee',
  description: 'Cabeça forjada com gume afiado e cabo de madeira.',
  nums: [num('haft', 'Comprimento do cabo', 0.4, 1.1, 0.75), num('head', 'Altura do gume', 0.1, 0.3, 0.18), num('reach', 'Profundidade da lâmina', 0.08, 0.2, 0.13)],
  choices: [choice('style', 'Cabeça', [['barbado', 'Barbada (viking)'], ['simples', 'Simples'], ['duplo', 'Dupla (labrys)']]), choice('spike', 'Ponta traseira', YESNO, 'nao')],
  build(p) {
    const H = n(p, 'haft');
    const h = n(p, 'head');
    const R = n(p, 'reach');
    const top = H - 0.06;
    const half = (): B.V2[] => {
      const st = s(p, 'style');
      if (st === 'barbado')
        return [[0.02, 0.02], [0.05, 0.025], [R, h * 0.55], [R + 0.01, h * 0.25], [R, -h * 0.05], [R * 0.8, -h * 0.4], [R * 0.55, -h * 0.55], [R * 0.4, -h * 0.25], [0.05, -0.02], [0.02, -0.02]];
      return [[0.02, 0.022], [0.06, 0.025], [R, h * 0.5], [R + 0.012, 0], [R, -h * 0.5], [0.06, -0.025], [0.02, -0.022]];
    };
    const wing = sharpen(B.extrude([[0.015, 0.03], ...half(), [0.015, -0.03]], 0.022), 0.05, R + 0.012, 0.08);
    const parts: WeaponPart[] = [
      { name: 'Cabo', slot: 'wood', mesh: place(B.lathe([[0.016, 0], [0.017, H * 0.5], [0.0145, H]], 14), T.s(1, 1, 0.75)) },
      { name: 'Olho da cabeça', slot: 'metal', mesh: place(B.roundedBox(0.045, 0.07, 0.034, 0.006), T.at(0, top, 0)) },
      { name: 'Gume', slot: 'blade', mesh: place(wing, T.at(0, top, 0)) },
    ];
    if (s(p, 'style') === 'duplo') parts.push({ name: 'Gume traseiro', slot: 'blade', mesh: place(wing, T.at(0, top, 0), T.s(-1, 1, 1)) });
    else if (yes(p, 'spike')) parts.push({ name: 'Ponta', slot: 'metal', mesh: place(B.lathe([[0.016, 0], [0.012, 0.03], [0, 0.07]], 10), T.at(-0.02, top, 0), T.rz(Math.PI / 2)) });
    parts.push({ name: 'Ponteira', slot: 'metal', mesh: place(B.lathe([[0, -0.012], [0.017, -0.008], [0.017, 0.02]], 14), T.s(1, 1, 0.75)) });
    return parts;
  },
};

const spear: WeaponType = {
  id: 'spear',
  name: 'Lança',
  category: 'melee',
  description: 'Haste longa com ponta em folha.',
  nums: [num('shaft', 'Comprimento da haste', 1.4, 2.6, 2), num('head', 'Comprimento da ponta', 0.15, 0.45, 0.3), num('width', 'Largura da ponta', 0.03, 0.09, 0.055, 0.002)],
  choices: [choice('shape', 'Ponta', [['folha', 'Folha'], ['triangular', 'Triangular'], ['alada', 'Alada (com asas)']])],
  build(p) {
    const L = n(p, 'shaft');
    const hl = n(p, 'head');
    const shape = s(p, 'shape');
    const parts: WeaponPart[] = [
      { name: 'Haste', slot: 'wood', mesh: B.lathe([[0.016, 0], [0.0165, L * 0.5], [0.015, L]], 14) },
      { name: 'Alvado', slot: 'metal', mesh: place(B.lathe([[0.018, 0], [0.017, 0.07], [0.011, 0.12]], 14), T.at(0, L - 0.04, 0)) },
      { name: 'Ponta', slot: 'blade', mesh: place(blade({ length: hl, width: n(p, 'width') / 2, taper: shape === 'triangular' ? 0.05 : 0.9, tipStart: shape === 'triangular' ? 0.99 : 0.55, thickness: 0.006 }), T.at(0, L + 0.075, 0)) },
      { name: 'Conto', slot: 'metal', mesh: B.lathe([[0, -0.05], [0.012, -0.02], [0.0165, 0.02]], 14) },
    ];
    if (shape === 'alada') {
      const wing = sharpen(B.extrude([[0, -0.012], [0.07, 0.008], [0.06, 0.02], [0, 0.012]], 0.008), 0.01, 0.07, 0.2);
      parts.push({ name: 'Asas', slot: 'metal', mesh: B.merge(place(wing, T.at(0, L + 0.06, 0)), place(wing, T.at(0, L + 0.06, 0), T.s(-1, 1, 1))) });
    }
    return parts;
  },
};

const warhammer: WeaponType = {
  id: 'warhammer',
  name: 'Martelo de guerra',
  category: 'melee',
  description: 'Cabeça de impacto com bico e ponta superior.',
  nums: [num('haft', 'Comprimento do cabo', 0.5, 1.4, 0.85), num('head', 'Tamanho da cabeça', 0.05, 0.12, 0.075, 0.005)],
  choices: [choice('back', 'Traseira', [['bico', 'Bico curvo'], ['plana', 'Plana (marreta)']]), choice('topspike', 'Ponta superior', YESNO)],
  build(p) {
    const H = n(p, 'haft');
    const k = n(p, 'head');
    const top = H - 0.05;
    const parts: WeaponPart[] = [
      { name: 'Cabo', slot: 'wood', mesh: place(B.lathe([[0.017, 0], [0.018, H * 0.6], [0.016, H]], 12), T.s(1, 1, 0.8)) },
      { name: 'Cabeça', slot: 'metal', mesh: place(B.roundedBox(k * 1.1, k, k, k * 0.12), T.at(k * 0.55, top, 0)) },
      { name: 'Face de impacto', slot: 'metal', mesh: place(B.lathe([[k * 0.42, 0], [k * 0.5, k * 0.15], [k * 0.46, k * 0.3]], 8), T.at(k * 1.1, top, 0), T.rz(-Math.PI / 2)) },
      { name: 'Langets', slot: 'metal', mesh: place(B.roundedBox(0.04, 0.28, 0.026, 0.004), T.at(0, top - 0.11, 0)) },
      { name: 'Empunhadura', slot: 'grip', mesh: place(grip(0.22, 0.019, 0.8), T.at(0, 0.24, 0)) },
    ];
    if (s(p, 'back') === 'bico') {
      const path: P.Vec3[] = Array.from({ length: 12 }, (_, i) => [-(i / 11) * k * 2.2, -Math.pow(i / 11, 2) * k * 0.9, 0]);
      parts.push({ name: 'Bico', slot: 'metal', mesh: place(B.tube(path, (t) => (1 - t) * k * 0.28 + 0.001, 6), T.at(0, top, 0)) });
    } else parts.push({ name: 'Traseira', slot: 'metal', mesh: place(B.roundedBox(k * 0.9, k * 0.9, k * 0.9, k * 0.1), T.at(-k * 0.45, top, 0)) });
    if (yes(p, 'topspike')) parts.push({ name: 'Ponta superior', slot: 'metal', mesh: place(B.lathe([[k * 0.22, 0], [k * 0.12, k * 0.8], [0, k * 1.8]], 8), T.at(0, top + k * 0.5, 0)) });
    return parts;
  },
};

const shield: WeaponType = {
  id: 'shield',
  name: 'Escudo',
  category: 'melee',
  description: 'Escudo de madeira com borda e umbo de metal.',
  nums: [num('size', 'Tamanho', 0.5, 1.1, 0.8), num('curve', 'Curvatura', 0, 0.6, 0.25, 0.02, '')],
  choices: [choice('shape', 'Formato', [['redondo', 'Redondo'], ['heater', 'Heater (gótico)'], ['pipa', 'Pipa (kite)']]), choice('boss', 'Umbo central', YESNO)],
  build(p) {
    const S = n(p, 'size');
    const k = n(p, 'curve') / S;
    const shape = s(p, 'shape');
    let outline: B.V2[];
    if (shape === 'redondo') outline = arc(S / 2, 0, Math.PI * 2, 48).slice(0, -1);
    else if (shape === 'heater') outline = [[-S * 0.42, S * 0.45], [S * 0.42, S * 0.45], ...Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [S * 0.42 * Math.cos(t * Math.PI / 2), S * 0.45 - S * 0.95 * Math.sin(t * Math.PI / 2)] as B.V2; }).slice(1), ...Array.from({ length: 12 }, (_, i) => { const t = 1 - (i + 1) / 12; return [-S * 0.42 * Math.cos(t * Math.PI / 2), S * 0.45 - S * 0.95 * Math.sin(t * Math.PI / 2)] as B.V2; })];
    else {
      const right: B.V2[] = Array.from({ length: 10 }, (_, i) => {
        const t = (i + 1) / 10;
        return [S * 0.36 * (1 - t), S * 0.2 - S * 0.95 * t];
      });
      const left: B.V2[] = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
      outline = [[0, S * 0.6], [S * 0.35, S * 0.42], [S * 0.36, S * 0.2], ...right, ...left, [-S * 0.36, S * 0.2], [-S * 0.35, S * 0.42]];
    }
    const unique = outline.filter((pt, i) => {
      const prev = outline[(i - 1 + outline.length) % outline.length];
      return Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-4;
    });
    const board = bow(B.extrude(unique, 0.018), k);
    const rim = bow(B.tube([...unique, unique[0]].map(([x, y]) => [x, y, 0.009] as P.Vec3), () => 0.011, 8), k);
    const parts: WeaponPart[] = [
      { name: 'Tábuas', slot: 'wood', mesh: board },
      { name: 'Borda', slot: 'metal', mesh: rim },
      { name: 'Alça', slot: 'grip', mesh: place(B.roundedBox(0.03, 0.14, 0.03, 0.008), T.at(0, 0, -0.04)) },
    ];
    if (yes(p, 'boss')) parts.push({ name: 'Umbo', slot: 'trim', mesh: place(B.lathe([[S * 0.13, 0], [S * 0.12, 0.02], [S * 0.09, 0.05], [S * 0.045, 0.07], [0, 0.075]], 24), T.rx(Math.PI / 2), T.at(0, 0, 0.0)) });
    return parts;
  },
};

// ---------------------------------------------------------------- firearms (barrel along +X)

const barrel = (len: number, r: number, x0: number, y: number): P.PolyMesh =>
  place(B.lathe([[r * 1.15, 0], [r * 1.1, len * 0.15], [r, len * 0.2], [r, len]], 16), T.at(x0, y, 0), T.rz(-Math.PI / 2));

const rail = (len: number, x0: number, y: number, slots = 0): P.PolyMesh => {
  const parts = [place(B.roundedBox(len, 0.008, 0.021, 0.0015), T.at(x0 + len / 2, y, 0))];
  for (let i = 0; i < slots; i++) parts.push(place(P.box(0.004, 0.004, 0.023), T.at(x0 + 0.006 + (i * (len - 0.012)) / Math.max(1, slots - 1), y + 0.005, 0)));
  return B.merge(...parts);
};

const scope = (len: number, r: number, x0: number, y: number): P.PolyMesh =>
  B.merge(
    place(B.lathe([[r * 1.6, 0], [r * 1.6, len * 0.18], [r, len * 0.3], [r, len * 0.7], [r * 1.3, len * 0.82], [r * 1.3, len]], 20), T.at(x0, y, 0), T.rz(-Math.PI / 2)),
    place(B.lathe([[r * 0.45, 0], [r * 0.45, r * 1.2]], 12), T.at(x0 + len * 0.5, y + r * 0.9, 0)),
    place(B.lathe([[r * 0.45, 0], [r * 0.45, r * 1.2]], 12), T.at(x0 + len * 0.5, y, r * 0.9), T.rx(Math.PI / 2)),
  );

const pistol: WeaponType = {
  id: 'pistol',
  name: 'Pistola',
  category: 'firearm',
  description: 'Semiautomática com armação de polímero e ferrolho de aço.',
  nums: [num('slide', 'Comprimento do ferrolho', 0.15, 0.22, 0.185), num('angle', 'Ângulo da empunhadura (°)', 5, 25, 18, 1, '°'), num('grip', 'Altura da empunhadura', 0.09, 0.14, 0.115)],
  choices: [choice('frame', 'Armação', [['polimero', 'Polímero'], ['metal', 'Aço']]), choice('suppressor', 'Supressor', YESNO, 'nao'), choice('light', 'Lanterna no trilho', YESNO, 'nao')],
  build(p) {
    const SL = n(p, 'slide');
    const a = (n(p, 'angle') * Math.PI) / 180;
    const gh = n(p, 'grip');
    const dx = Math.tan(a) * gh;
    const frame: B.V2[] = [
      [-0.03, 0], [SL - 0.03, 0], [SL - 0.03, -0.022], [0.07, -0.022], [0.055, -0.035],
      [0.03 - dx * 0.1, -0.035], [0.012 - dx, -gh], [-0.03 - dx, -gh], [-0.028 - dx * 0.2, -0.03], [-0.04, -0.012],
    ];
    const guard: B.V2[] = [[0.012, -0.022], [0.072, -0.022], [0.068, -0.05], [0.03, -0.058], [0.012, -0.045]];
    const guardHole: B.V2[] = [[0.02, -0.025], [0.062, -0.025], [0.058, -0.045], [0.03, -0.05], [0.02, -0.04]];
    const parts: WeaponPart[] = [
      { name: 'Armação', slot: s(p, 'frame') === 'metal' ? 'dark' : 'polymer', mesh: B.extrude(frame, 0.03) },
      { name: 'Guarda-mato', slot: s(p, 'frame') === 'metal' ? 'dark' : 'polymer', mesh: B.extrude(guard, 0.012, [guardHole]) },
      { name: 'Ferrolho', slot: 'dark', mesh: place(B.roundedBox(SL, 0.032, 0.027, 0.004), T.at(SL / 2 - 0.045, 0.016, 0)) },
      { name: 'Serrilhas', slot: 'dark', mesh: B.merge(...Array.from({ length: 7 }, (_, i) => place(P.box(0.002, 0.024, 0.029), T.at(-0.035 + i * 0.006, 0.016, 0)))) },
      { name: 'Cano', slot: 'metal', mesh: barrel(0.02, 0.0055, SL - 0.047, 0.018) },
      { name: 'Gatilho', slot: 'metal', mesh: B.extrude([[0.034, -0.022], [0.042, -0.022], [0.04, -0.04], [0.035, -0.046], [0.032, -0.04]], 0.006) },
      { name: 'Mira', slot: 'metal', mesh: B.merge(place(P.box(0.008, 0.006, 0.004), T.at(SL - 0.055, 0.035, 0)), place(P.box(0.008, 0.006, 0.016), T.at(-0.036, 0.035, 0))) },
      { name: 'Carregador', slot: 'metal', mesh: place(B.roundedBox(0.032, 0.012, 0.028, 0.004), T.at(-0.009 - dx, -gh - 0.004, 0)) },
    ];
    if (yes(p, 'suppressor')) parts.push({ name: 'Supressor', slot: 'dark', mesh: place(B.lathe([[0.014, 0], [0.016, 0.006], [0.016, 0.15], [0.012, 0.156], [0, 0.157]], 20), T.at(SL - 0.025, 0.018, 0), T.rz(-Math.PI / 2)) });
    if (yes(p, 'light')) parts.push({ name: 'Lanterna', slot: 'polymer', mesh: place(B.lathe([[0.012, 0], [0.012, 0.05], [0.014, 0.055], [0.014, 0.065]], 16), T.at(SL - 0.11, -0.032, 0), T.rz(-Math.PI / 2)) });
    return parts;
  },
};

function rifleParts(p: Params, kind: 'ar' | 'smg'): WeaponPart[] {
  const BL = n(p, 'barrel');
  const recv = kind === 'smg' ? 0.2 : 0.26;
  const hg = kind === 'smg' ? 0.12 : n(p, 'handguard');
  const y = 0.0;
  const parts: WeaponPart[] = [
    { name: 'Receptor superior', slot: 'dark', mesh: place(B.roundedBox(recv, 0.045, 0.034, 0.005), T.at(recv / 2, y + 0.022, 0)) },
    { name: 'Receptor inferior', slot: 'dark', mesh: B.extrude([[0.02, 0], [recv, 0], [recv - 0.02, -0.03], [0.11, -0.035], [0.1, -0.06], [0.04, -0.06], [0.02, -0.03]], 0.03) },
    { name: 'Trilho superior', slot: 'dark', mesh: rail(recv + hg - 0.02, 0.01, y + 0.048, Math.round((recv + hg) / 0.012)) },
    { name: 'Guarda-mão', slot: kind === 'smg' ? 'dark' : 'polymer', mesh: place(B.lathe([[0.024, 0], [0.024, hg]], 8), T.at(recv, y + 0.02, 0), T.rz(-Math.PI / 2), T.ry(Math.PI / 8)) },
    { name: 'Cano', slot: 'metal', mesh: barrel(BL, 0.0075, recv + hg - 0.02, y + 0.02) },
    { name: 'Freio de boca', slot: 'dark', mesh: place(B.lathe([[0.011, 0], [0.011, 0.055], [0.008, 0.06]], 8), T.at(recv + hg + BL - 0.04, y + 0.02, 0), T.rz(-Math.PI / 2)) },
    { name: 'Empunhadura', slot: 'polymer', mesh: B.extrude([[0.055, -0.035], [0.085, -0.035], [0.065, -0.12], [0.035, -0.12]], 0.026) },
    { name: 'Gatilho e guarda', slot: 'metal', mesh: B.extrude([[0.085, -0.034], [0.135, -0.034], [0.135, -0.05], [0.085, -0.05]], 0.012, [[[0.092, -0.037], [0.128, -0.037], [0.128, -0.046], [0.092, -0.046]]]) },
  ];
  const mag = s(p, 'mag');
  const magLen = kind === 'smg' ? 0.16 : 0.2;
  const curve = mag === 'curvo' ? 0.22 : 0;
  const magSecs: P.Vec3[][] = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const yy = -0.03 - t * magLen;
    const xo = 0.16 + curve * t * t * magLen;
    return ([[-0.017, -0.013], [0.017, -0.013], [0.017, 0.013], [-0.017, 0.013]] as [number, number][]).map(([x, z]) => [xo + x, yy, z] as P.Vec3);
  });
  parts.push({ name: 'Carregador', slot: mag === 'tambor' ? 'polymer' : 'metal', mesh: mag === 'tambor' ? place(B.lathe([[0.07, 0], [0.07, 0.05]], 28), T.at(0.16, -0.1, -0.025), T.rx(Math.PI / 2)) : B.loft(magSecs) });
  const stock = s(p, 'stock');
  if (stock === 'fixa') parts.push({ name: 'Coronha', slot: 'polymer', mesh: B.extrude([[0.02, 0.04], [0.02, -0.03], [-0.2, -0.07], [-0.26, -0.085], [-0.27, -0.08], [-0.27, 0.05], [-0.2, 0.05]], 0.034) });
  else if (stock === 'telescopica')
    parts.push(
      { name: 'Tubo da coronha', slot: 'dark', mesh: place(B.lathe([[0.014, 0], [0.014, 0.2]], 14), T.at(0.02, 0.02, 0), T.rz(Math.PI / 2)) },
      { name: 'Coronha', slot: 'polymer', mesh: B.extrude([[-0.12, 0.04], [-0.12, -0.0], [-0.21, -0.07], [-0.235, -0.07], [-0.235, 0.05]], 0.032) },
    );
  else if (stock === 'dobravel') parts.push({ name: 'Coronha dobrável', slot: 'dark', mesh: B.merge(rod([0.02, 0.03, 0.012], [-0.24, 0.0, 0.012], 0.005), rod([0.02, -0.02, 0.012], [-0.24, -0.04, 0.012], 0.005), place(B.roundedBox(0.012, 0.09, 0.03, 0.003), T.at(-0.245, -0.02, 0.012))) });
  const optic = s(p, 'optic');
  if (optic === 'reddot') parts.push({ name: 'Red dot', slot: 'dark', mesh: B.merge(place(B.roundedBox(0.04, 0.012, 0.026, 0.003), T.at(0.12, y + 0.058, 0)), place(B.lathe([[0.017, 0], [0.017, 0.04]], 16), T.at(0.1, y + 0.078, 0), T.rz(-Math.PI / 2))) });
  if (optic === 'luneta') parts.push({ name: 'Luneta', slot: 'dark', mesh: B.merge(scope(0.24, 0.0125, 0.02, y + 0.088), place(B.roundedBox(0.02, 0.03, 0.022, 0.003), T.at(0.08, y + 0.065, 0)), place(B.roundedBox(0.02, 0.03, 0.022, 0.003), T.at(0.19, y + 0.065, 0))) });
  if (kind === 'smg' && yes(p, 'foregrip')) parts.push({ name: 'Empunhadura frontal', slot: 'polymer', mesh: place(B.lathe([[0.014, -0.08], [0.016, -0.04], [0.014, 0]], 12), T.at(recv + 0.06, y - 0.004, 0)) });
  return parts;
}

const assaultRifle: WeaponType = {
  id: 'assault-rifle',
  name: 'Fuzil de assalto',
  category: 'firearm',
  description: 'Plataforma modular com trilhos, guarda-mão e ótica.',
  nums: [num('barrel', 'Cano exposto', 0.08, 0.3, 0.16), num('handguard', 'Guarda-mão', 0.18, 0.38, 0.28)],
  choices: [choice('mag', 'Carregador', [['curvo', 'Curvo'], ['reto', 'Reto'], ['tambor', 'Tambor']]), choice('stock', 'Coronha', [['telescopica', 'Telescópica'], ['fixa', 'Fixa'], ['nenhuma', 'Sem coronha']]), choice('optic', 'Ótica', [['reddot', 'Red dot'], ['luneta', 'Luneta'], ['nenhuma', 'Nenhuma']])],
  build: (p) => rifleParts(p, 'ar'),
};

const smg: WeaponType = {
  id: 'smg',
  name: 'Submetralhadora',
  category: 'firearm',
  description: 'Compacta, com coronha dobrável e empunhadura frontal.',
  nums: [num('barrel', 'Cano exposto', 0.02, 0.12, 0.05)],
  choices: [choice('mag', 'Carregador', [['reto', 'Reto'], ['curvo', 'Curvo']]), choice('stock', 'Coronha', [['dobravel', 'Dobrável'], ['telescopica', 'Telescópica'], ['nenhuma', 'Sem coronha']]), choice('optic', 'Ótica', [['reddot', 'Red dot'], ['nenhuma', 'Nenhuma']]), choice('foregrip', 'Empunhadura frontal', YESNO)],
  build: (p) => rifleParts(p, 'smg'),
};

const shotgun: WeaponType = {
  id: 'shotgun',
  name: 'Espingarda',
  category: 'firearm',
  description: 'Ação por bomba com tubo de carregador.',
  nums: [num('barrel', 'Comprimento do cano', 0.35, 0.75, 0.5), num('forend', 'Telha (pump)', 0.12, 0.26, 0.18)],
  choices: [choice('stock', 'Coronha', [['madeira', 'Madeira'], ['polimero', 'Polímero']]), choice('rib', 'Faixa ventilada', YESNO)],
  build(p) {
    const BL = n(p, 'barrel');
    const fe = n(p, 'forend');
    const wood = s(p, 'stock') === 'madeira';
    const parts: WeaponPart[] = [
      { name: 'Receptor', slot: 'dark', mesh: place(B.roundedBox(0.2, 0.06, 0.034, 0.006), T.at(0.1, 0.0, 0)) },
      { name: 'Cano', slot: 'metal', mesh: barrel(BL, 0.011, 0.2, 0.015) },
      { name: 'Tubo do carregador', slot: 'dark', mesh: place(B.lathe([[0.01, 0], [0.01, BL * 0.8], [0.011, BL * 0.82]], 14), T.at(0.2, -0.014, 0), T.rz(-Math.PI / 2)) },
      { name: 'Telha (pump)', slot: wood ? 'wood' : 'polymer', mesh: place(B.lathe([[0.02, 0], [0.023, 0.01], [0.023, fe - 0.01], [0.02, fe]], 14), T.at(0.24, -0.008, 0), T.rz(-Math.PI / 2), T.s(1, 1, 0.9)) },
      { name: 'Coronha', slot: wood ? 'wood' : 'polymer', mesh: B.extrude([[0.0, 0.03], [0.0, -0.03], [-0.05, -0.06], [-0.09, -0.11], [-0.33, -0.13], [-0.34, -0.12], [-0.34, 0.03], [-0.08, 0.025]], 0.036) },
      { name: 'Guarda-mato', slot: 'dark', mesh: B.extrude([[0.02, -0.03], [0.09, -0.03], [0.085, -0.055], [0.03, -0.058]], 0.012, [[[0.028, -0.033], [0.082, -0.033], [0.078, -0.05], [0.034, -0.052]]]) },
      { name: 'Massa de mira', slot: 'metal', mesh: place(B.lathe([[0.002, 0], [0.002, 0.006], [0, 0.008]], 8), T.at(0.19 + BL, 0.027, 0)) },
    ];
    if (yes(p, 'rib')) parts.push({ name: 'Faixa ventilada', slot: 'dark', mesh: rail(BL, 0.2, 0.029, Math.round(BL / 0.03)) });
    return parts;
  },
};

const sniper: WeaponType = {
  id: 'sniper',
  name: 'Rifle de precisão',
  category: 'firearm',
  description: 'Ação de ferrolho, cano pesado, luneta e bipé.',
  nums: [num('barrel', 'Comprimento do cano', 0.45, 0.8, 0.62), num('scope', 'Comprimento da luneta', 0.25, 0.42, 0.33)],
  choices: [choice('stock', 'Coronha', [['madeira', 'Madeira'], ['polimero', 'Polímero tático']]), choice('bipod', 'Bipé', YESNO), choice('suppressor', 'Supressor', YESNO, 'nao')],
  build(p) {
    const BL = n(p, 'barrel');
    const wood = s(p, 'stock') === 'madeira';
    const parts: WeaponPart[] = [
      { name: 'Receptor', slot: 'metal', mesh: place(B.lathe([[0.017, 0], [0.017, 0.24]], 18), T.at(0, 0.02, 0), T.rz(-Math.PI / 2)) },
      { name: 'Cano', slot: 'dark', mesh: place(B.lathe([[0.014, 0], [0.013, 0.05], [0.011, BL * 0.5], [0.009, BL]], 16), T.at(0.24, 0.02, 0), T.rz(-Math.PI / 2)) },
      { name: 'Ferrolho', slot: 'metal', mesh: B.merge(rod([0.04, 0.025, 0.012], [0.04, 0.01, 0.045], 0.004, 8), place(B.lathe(Array.from({ length: 7 }, (_, i) => { const a = -Math.PI / 2 + (i / 6) * Math.PI; return [Math.cos(a) * 0.008, Math.sin(a) * 0.008] as B.V2; }), 12), T.at(0.04, 0.008, 0.05))) },
      {
        name: 'Coronha',
        slot: wood ? 'wood' : 'polymer',
        mesh: B.extrude([[0.42, 0.012], [0.42, -0.01], [0.2, -0.03], [0.09, -0.035], [0.06, -0.09], [0.02, -0.09], [-0.01, -0.03], [-0.3, -0.07], [-0.36, -0.08], [-0.36, 0.035], [-0.12, 0.04], [-0.05, 0.012]], 0.045),
      },
      { name: 'Luneta', slot: 'dark', mesh: B.merge(scope(n(p, 'scope'), 0.014, -0.02, 0.07), place(B.roundedBox(0.02, 0.035, 0.024, 0.003), T.at(0.05, 0.045, 0)), place(B.roundedBox(0.02, 0.035, 0.024, 0.003), T.at(0.19, 0.045, 0))) },
      { name: 'Gatilho', slot: 'metal', mesh: B.extrude([[0.07, -0.03], [0.075, -0.03], [0.072, -0.05], [0.066, -0.052]], 0.006) },
    ];
    if (yes(p, 'bipod')) parts.push({ name: 'Bipé', slot: 'dark', mesh: B.merge(rod([0.36, -0.01, 0.01], [0.38, -0.2, 0.06], 0.005), rod([0.36, -0.01, -0.01], [0.38, -0.2, -0.06], 0.005)) });
    if (yes(p, 'suppressor')) parts.push({ name: 'Supressor', slot: 'dark', mesh: place(B.lathe([[0.019, 0], [0.021, 0.008], [0.021, 0.18], [0.016, 0.19], [0, 0.19]], 20), T.at(0.24 + BL - 0.01, 0.02, 0), T.rz(-Math.PI / 2)) });
    return parts;
  },
};

// ---------------------------------------------------------------- bows & arrows (vertical along Y)

function bowParts(p: Params, recurve: boolean): WeaponPart[] {
  const L = n(p, 'length');
  const draw = n(p, 'curve');
  const half = L / 2;
  const limb = (sign: number) => {
    const pts: P.Vec3[] = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      const y = 0.09 + t * (half - 0.09);
      let x = -draw * Math.pow(t, 1.6);
      if (recurve && t > 0.78) x += Math.pow((t - 0.78) / 0.22, 2) * draw * 0.9;
      return [x, sign * y, 0];
    });
    const m = B.tube(pts, (t) => lerp(0.016, 0.006, t), 10);
    return place(m, T.s(1, 1, 1.6));
  };
  const tipTop = (() => {
    const t = 1;
    let x = -draw;
    if (recurve) x += draw * 0.9;
    void t;
    return x;
  })();
  const riser = B.extrude([[0.012, -0.12], [0.03, -0.06], [0.03, 0.06], [0.012, 0.12], [-0.03, 0.1], [-0.022, 0.03], [-0.025, -0.03], [-0.03, -0.1]], 0.032);
  return [
    { name: 'Empunhadura (riser)', slot: recurve ? 'wood' : 'wood', mesh: riser },
    { name: 'Braço superior', slot: 'wood', mesh: limb(1), shading: 'smooth' },
    { name: 'Braço inferior', slot: 'wood', mesh: limb(-1), shading: 'smooth' },
    { name: 'Corda', slot: 'string', mesh: rod([tipTop, half - 0.01, 0], [tipTop, -half + 0.01, 0], 0.0018, 6), shading: 'smooth' },
    { name: 'Couro da empunhadura', slot: 'grip', mesh: place(B.roundedBox(0.064, 0.09, 0.036, 0.01), T.at(-0.002, 0, 0)) },
  ];
}

const recurveBow: WeaponType = {
  id: 'recurve-bow',
  name: 'Arco recurvo',
  category: 'ranged',
  description: 'Braços com pontas recurvadas e corda.',
  nums: [num('length', 'Comprimento total', 1.2, 1.75, 1.55), num('curve', 'Curvatura dos braços', 0.08, 0.3, 0.17)],
  choices: [],
  build: (p) => bowParts(p, true),
};

const longbow: WeaponType = {
  id: 'longbow',
  name: 'Arco longo',
  category: 'ranged',
  description: 'Arco inglês de peça única.',
  nums: [num('length', 'Comprimento total', 1.6, 2.0, 1.85), num('curve', 'Curvatura dos braços', 0.05, 0.2, 0.11)],
  choices: [],
  build: (p) => bowParts(p, false),
};

const arrowParts = (len: number, head: string, fletch: number, x0 = 0, y0 = 0): WeaponPart[] => {
  const headMesh =
    head === 'bodkin'
      ? B.lathe([[0.006, 0], [0.005, 0.02], [0, 0.07]], 4)
      : sharpen(B.extrude(head === 'broadhead' ? [[0, 0.065], [0.02, 0.0], [0.006, 0.006], [-0.006, 0.006], [-0.02, 0]] : [[0, 0.04], [0.012, 0.0], [-0.012, 0]], 0.004), 0.004, 0.02, 0.1);
  const vane = B.extrude([[0, 0], [0.016, 0.02], [0.012, 0.11], [0, 0.12]], 0.0015);
  const vanes = Array.from({ length: fletch }, (_, i) => place(vane, T.at(x0, y0 + 0.03, 0), T.ry((i / fletch) * Math.PI * 2), T.at(0.003, 0, 0)));
  return [
    { name: 'Haste', slot: 'wood', mesh: place(B.lathe([[0.0042, 0], [0.0042, len]], 10), T.at(x0, y0, 0)), shading: 'smooth' },
    { name: 'Ponta', slot: 'blade', mesh: place(headMesh, T.at(x0, y0 + len, 0)) },
    { name: 'Penas', slot: 'fletch', mesh: B.merge(...vanes) },
    { name: 'Nock', slot: 'polymer', mesh: place(B.lathe([[0.005, -0.012], [0.005, 0]], 10), T.at(x0, y0, 0)) },
  ];
};

const arrow: WeaponType = {
  id: 'arrow',
  name: 'Flecha',
  category: 'ranged',
  description: 'Haste, ponta e penas.',
  nums: [num('length', 'Comprimento', 0.6, 0.9, 0.76), num('vanes', 'Número de penas', 3, 4, 3, 1, '')],
  choices: [choice('head', 'Ponta', [['broadhead', 'Larga (caça)'], ['campo', 'Campo'], ['bodkin', 'Bodkin (perfurante)']])],
  build: (p) => arrowParts(n(p, 'length'), s(p, 'head'), Math.round(n(p, 'vanes'))),
};

const crossbow: WeaponType = {
  id: 'crossbow',
  name: 'Besta',
  category: 'ranged',
  description: 'Coronha de madeira, arco transversal, estribo e virote.',
  nums: [num('span', 'Envergadura do arco', 0.5, 0.9, 0.7), num('stock', 'Comprimento da coronha', 0.6, 0.95, 0.8)],
  choices: [choice('bolt', 'Virote carregado', YESNO)],
  build(p) {
    const S = n(p, 'span') / 2;
    const L = n(p, 'stock');
    const prodPath: P.Vec3[] = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24 - 0.5;
      return [L * 0.92 - Math.pow(Math.abs(t) * 2, 1.8) * 0.12, 0.03, t * 2 * S];
    });
    const tips = [prodPath[0], prodPath[24]];
    const parts: WeaponPart[] = [
      { name: 'Coronha', slot: 'wood', mesh: B.extrude([[L, 0.04], [L, 0.0], [0.25, -0.01], [0.18, -0.07], [0.1, -0.075], [-0.05, -0.06], [-0.05, 0.03], [0.2, 0.04]], 0.05) },
      { name: 'Arco (prod)', slot: 'dark', mesh: B.tube(prodPath, (t) => lerp(0.016, 0.009, Math.abs(t - 0.5) * 2), 10), shading: 'smooth' },
      { name: 'Corda', slot: 'string', mesh: B.merge(rod(tips[0], [0.42, 0.045, 0], 0.002, 6), rod([0.42, 0.045, 0], tips[1], 0.002, 6)), shading: 'smooth' },
      { name: 'Estribo', slot: 'metal', mesh: B.tube(arc(0.06, 0, Math.PI, 14).map(([z, x]) => [L + 0.02 + x, 0.02, z] as P.Vec3), () => 0.006, 8) },
      { name: 'Gatilho', slot: 'metal', mesh: B.extrude([[0.25, -0.01], [0.27, -0.01], [0.24, -0.08], [0.225, -0.08]], 0.008) },
      { name: 'Trilho', slot: 'metal', mesh: place(B.roundedBox(L - 0.4, 0.006, 0.012, 0.002), T.at(0.42 + (L - 0.4) / 2 - 0.02, 0.043, 0)) },
    ];
    if (yes(p, 'bolt')) for (const a of arrowParts(0.38, 'bodkin', 3)) parts.push({ ...a, name: `Virote: ${a.name}`, mesh: place(a.mesh, T.at(0.42, 0.052, 0), T.rz(-Math.PI / 2)) });
    return parts;
  },
};

// ---------------------------------------------------------------- sci-fi & fantasy

const energySword: WeaponType = {
  id: 'energy-sword',
  name: 'Espada de energia',
  category: 'scifi',
  description: 'Punho metálico com emissor e lâmina de energia.',
  nums: [num('blade', 'Comprimento da lâmina', 0.6, 1.1, 0.9), num('hilt', 'Comprimento do punho', 0.2, 0.32, 0.26), num('thick', 'Espessura da lâmina', 0.012, 0.03, 0.018, 0.001)],
  choices: [choice('emitter', 'Emissor', [['anel', 'Anéis'], ['garras', 'Garras'], ['liso', 'Liso']]), choice('cross', 'Guarda de energia', YESNO, 'nao')],
  build(p) {
    const H = n(p, 'hilt');
    const r = n(p, 'thick');
    const BL = n(p, 'blade');
    const hiltProf: B.V2[] = [[0, -H], [0.016, -H + 0.004], [0.018, -H + 0.02], [0.016, -H + 0.03]];
    for (let i = 0; i < 6; i++) hiltProf.push([0.0165, -H + 0.04 + i * 0.022], [0.0155, -H + 0.05 + i * 0.022]);
    hiltProf.push([0.017, -0.02], [0.021, -0.012], [0.021, 0], [0.013, 0.004]);
    const parts: WeaponPart[] = [
      { name: 'Punho', slot: 'metal', mesh: B.lathe(hiltProf, 24) },
      { name: 'Empunhadura', slot: 'dark', mesh: place(B.lathe([[0.0168, 0], [0.0168, H * 0.45]], 20), T.at(0, -H * 0.8, 0)) },
      { name: 'Lâmina de energia', slot: 'glow', mesh: B.lathe([[r * 0.7, 0], [r, 0.02], [r, BL - r * 2], [r * 0.6, BL - r * 0.6], [0, BL]], 20), shading: 'smooth' },
    ];
    const em = s(p, 'emitter');
    if (em === 'anel') parts.push({ name: 'Emissor', slot: 'trim', mesh: B.merge(place(P.torus(0.022, 0.003, 24, 8), T.at(0, -0.006, 0)), place(P.torus(0.02, 0.0025, 24, 8), T.at(0, -0.016, 0))) });
    if (em === 'garras') parts.push({ name: 'Emissor', slot: 'trim', mesh: B.merge(...[0, 1, 2].map((i) => place(B.tube([[0.02, -0.01, 0], [0.024, 0.01, 0], [0.012, 0.035, 0]], (t) => lerp(0.004, 0.0015, t), 6), T.ry((i * Math.PI * 2) / 3)))) });
    if (yes(p, 'cross')) parts.push({ name: 'Guarda de energia', slot: 'glow', mesh: place(B.lathe([[0, 0], [r * 0.6, 0.01], [r * 0.6, 0.11], [0, 0.12]], 12), T.at(0.0, 0.01, 0), T.rz(-Math.PI / 2), T.at(0, -0.06, 0)), shading: 'smooth' });
    return parts;
  },
};

function blasterParts(p: Params, kind: 'rifle' | 'pistol'): WeaponPart[] {
  const L = kind === 'rifle' ? n(p, 'length') : 0.22;
  const h = kind === 'rifle' ? 0.07 : 0.05;
  const body: B.V2[] = kind === 'rifle'
    ? [[-0.05, h], [L * 0.55, h], [L * 0.62, h * 0.6], [L * 0.62, 0], [L * 0.4, -0.01], [0.18, -0.01], [0.15, -0.045], [0.02, -0.045], [-0.05, 0.0]]
    : [[-0.03, h * 0.8], [L * 0.75, h * 0.8], [L * 0.8, h * 0.35], [L * 0.75, 0], [0.06, 0], [0.04, -0.02], [-0.01, -0.02], [-0.03, 0.02]];
  const parts: WeaponPart[] = [
    { name: 'Corpo', slot: 'polymer', mesh: B.extrude(body, kind === 'rifle' ? 0.05 : 0.034) },
    { name: 'Placas laterais', slot: 'metal', mesh: B.merge(place(B.roundedBox(L * 0.3, h * 0.5, 0.004, 0.0015), T.at(L * 0.25, h * 0.45, (kind === 'rifle' ? 0.025 : 0.017) + 0.002)), place(B.roundedBox(L * 0.3, h * 0.5, 0.004, 0.0015), T.at(L * 0.25, h * 0.45, -(kind === 'rifle' ? 0.025 : 0.017) - 0.002))) },
    { name: 'Empunhadura', slot: 'dark', mesh: B.extrude(kind === 'rifle' ? [[0.03, -0.04], [0.07, -0.04], [0.05, -0.14], [0.01, -0.14]] : [[0.0, -0.015], [0.04, -0.015], [0.02, -0.11], [-0.025, -0.11]], 0.03) },
    { name: 'Emissor', slot: 'metal', mesh: place(B.lathe([[0.014, 0], [0.016, 0.01], [0.012, kind === 'rifle' ? L * 0.45 : 0.06], [0.016, (kind === 'rifle' ? L * 0.45 : 0.06) + 0.01]], 12), T.at(kind === 'rifle' ? L * 0.6 : L * 0.78, h * 0.4, 0), T.rz(-Math.PI / 2)) },
  ];
  const coils = kind === 'rifle' ? Math.round(n(p, 'coils')) : 3;
  const cx = kind === 'rifle' ? L * 0.66 : L * 0.82;
  parts.push({ name: 'Bobinas de energia', slot: 'glow', mesh: B.merge(...Array.from({ length: coils }, (_, i) => place(P.torus(0.018, 0.004, 20, 8), T.at(cx + i * 0.025, h * 0.4, 0), T.rz(Math.PI / 2)))) });
  parts.push({ name: 'Célula de energia', slot: 'glow', mesh: place(B.lathe([[0.012, 0], [0.012, 0.07]], 14), T.at(kind === 'rifle' ? 0.12 : 0.1, kind === 'rifle' ? -0.03 : 0.03, 0), T.rz(-Math.PI / 2)), shading: 'smooth' });
  if (kind === 'rifle' && yes(p, 'stock')) parts.push({ name: 'Coronha', slot: 'polymer', mesh: B.extrude([[-0.05, 0.06], [-0.05, 0.0], [-0.25, -0.05], [-0.28, -0.05], [-0.28, 0.06], [-0.2, 0.065]], 0.04, [[[-0.22, 0.04], [-0.12, 0.035], [-0.17, 0.0], [-0.24, -0.025], [-0.255, 0.0]]]) });
  if (kind === 'rifle' && yes(p, 'scope')) parts.push({ name: 'Mira holográfica', slot: 'dark', mesh: B.merge(place(B.roundedBox(0.06, 0.02, 0.03, 0.004), T.at(0.15, h + 0.012, 0)), place(B.extrude([[-0.02, 0], [0.02, 0], [0.02, 0.035], [-0.02, 0.035]], 0.03, [[[-0.014, 0.006], [0.014, 0.006], [0.014, 0.03], [-0.014, 0.03]]]), T.at(0.15, h + 0.02, 0), T.ry(Math.PI / 2))) });
  return parts;
}

const plasmaRifle: WeaponType = {
  id: 'plasma-rifle',
  name: 'Rifle de plasma',
  category: 'scifi',
  description: 'Corpo angular, bobinas e célula de energia brilhantes.',
  nums: [num('length', 'Comprimento', 0.5, 0.9, 0.7), num('coils', 'Bobinas', 2, 6, 4, 1, '')],
  choices: [choice('stock', 'Coronha', YESNO), choice('scope', 'Mira holográfica', YESNO)],
  build: (p) => blasterParts(p, 'rifle'),
};

const laserPistol: WeaponType = {
  id: 'laser-pistol',
  name: 'Pistola laser',
  category: 'scifi',
  description: 'Pistola futurista com emissor e bobinas.',
  nums: [],
  choices: [],
  build: (p) => blasterParts(p, 'pistol'),
};

const staff: WeaponType = {
  id: 'magic-staff',
  name: 'Cajado mágico',
  category: 'scifi',
  description: 'Haste torcida, garras e cristal brilhante.',
  nums: [num('length', 'Comprimento', 1.2, 2.0, 1.6), num('twist', 'Torção', 0, 3, 1.5, 0.1, 'voltas'), num('crystal', 'Tamanho do cristal', 0.04, 0.12, 0.07, 0.005)],
  choices: [choice('claws', 'Garras', [['3', '3'], ['4', '4'], ['5', '5']]), choice('bands', 'Anéis de metal', YESNO)],
  build(p, r) {
    const L = n(p, 'length');
    const tw = n(p, 'twist');
    const c = n(p, 'crystal');
    const strands = 3;
    const shaft = B.merge(
      ...Array.from({ length: strands }, (_, k) =>
        B.tube(
          Array.from({ length: 60 }, (_, i) => {
            const t = i / 59;
            const a = (k / strands) * Math.PI * 2 + t * tw * Math.PI * 2;
            const rad = 0.008 + 0.004 * Math.sin(t * Math.PI * 6 + k);
            return [Math.cos(a) * rad, t * L, Math.sin(a) * rad] as P.Vec3;
          }),
          (t) => lerp(0.011, 0.008, t),
          8,
        ),
      ),
    );
    const claws = Number(s(p, 'claws'));
    const top = L;
    const clawMesh = B.merge(
      ...Array.from({ length: claws }, (_, i) =>
        place(B.tube(Array.from({ length: 10 }, (_, j) => {
          const t = j / 9;
          return [0.012 + Math.sin(t * Math.PI) * c * 0.9 * (1 - t * 0.3), t * c * 2.2, 0] as P.Vec3;
        }), (t) => lerp(0.007, 0.002, t), 6), T.at(0, top - 0.02, 0), T.ry((i / claws) * Math.PI * 2 + r.range(-0.1, 0.1))),
      ),
    );
    const crystal = place(B.lathe([[0, -c * 0.9], [c * 0.45, -c * 0.3], [c * 0.5, c * 0.2], [c * 0.3, c * 0.8], [0, c * 1.2]], 6), T.at(0, top + c * 1.1, 0));
    const parts: WeaponPart[] = [
      { name: 'Haste', slot: 'wood', mesh: shaft, shading: 'smooth' },
      { name: 'Garras', slot: 'trim', mesh: clawMesh, shading: 'smooth' },
      { name: 'Cristal', slot: 'crystal', mesh: crystal, shading: 'flat' },
      { name: 'Ponteira', slot: 'trim', mesh: B.lathe([[0, -0.04], [0.012, -0.02], [0.016, 0.02]], 10) },
    ];
    if (yes(p, 'bands')) parts.push({ name: 'Anéis', slot: 'trim', mesh: B.merge(...[0.35, 0.55, 0.92].map((t) => place(P.torus(0.02, 0.005, 20, 8), T.at(0, t * L, 0), T.rx(Math.PI / 2)))) });
    return parts;
  },
};

export const WEAPONS: WeaponType[] = [longsword, katana, dagger, axe, spear, warhammer, shield, pistol, assaultRifle, shotgun, sniper, smg, recurveBow, longbow, crossbow, arrow, energySword, plasmaRifle, laserPistol, staff];

export function defaultParams(w: WeaponType): Params {
  const p: Params = {};
  for (const x of w.nums) p[x.key] = x.value;
  for (const c of w.choices) p[c.key] = c.value;
  return p;
}

/** Random parameters within each range (rounded to the step). */
export function randomParams(w: WeaponType, seed: number): Params {
  const r = B.rng(seed);
  const p: Params = {};
  for (const x of w.nums) p[x.key] = Math.round(r.range(x.min, x.max) / x.step) * x.step;
  for (const c of w.choices) p[c.key] = r.pick(c.options).id;
  return p;
}

export function buildWeapon(w: WeaponType, p: Params, seed = 1): WeaponPart[] {
  return w.build({ ...defaultParams(w), ...p }, B.rng(seed)).filter((part) => part.mesh.f.length > 0);
}
