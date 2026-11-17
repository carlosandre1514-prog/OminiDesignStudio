import { clamp01, fbm, hash2, smooth, valueNoise, worley } from './noise';

/**
 * Procedural pattern library. Every generator returns a tileable scalar field in [0,1]
 * that layers use for colour gradients, height, roughness/metal variation or masks.
 */

export interface NumDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}
export interface ChoiceDef {
  key: string;
  label: string;
  options: [string, string][];
  value: string;
}
export type Params = Record<string, number | string>;

export interface GeneratorDef {
  id: string;
  label: string;
  group: 'Ruídos' | 'Superfícies' | 'Desgaste' | 'Geométricos' | 'Industriais';
  nums: NumDef[];
  choices?: ChoiceDef[];
  /** Build a sampler for a given output resolution (some generators rasterise first). */
  prepare(p: Params, size: number): (u: number, v: number) => number;
}

const N = (key: string, label: string, min: number, max: number, value: number, step = 1): NumDef => ({ key, label, min, max, step, value });
const SEED = N('seed', 'Semente', 1, 999, 1);
const n = (p: Params, k: string) => Number(p[k]);
const frac = (x: number) => x - Math.floor(x);

/** Rasterise thin line segments (with wrap-around) into a coverage buffer. */
function rasterLines(size: number, lines: { x: number; y: number; dx: number; dy: number; w: number; a: number }[]) {
  const buf = new Float32Array(size * size);
  for (const l of lines) {
    const len = Math.hypot(l.dx, l.dy) * size;
    const steps = Math.max(2, Math.ceil(len * 1.5));
    const w = Math.max(0.5, l.w * size);
    const r = Math.ceil(w + 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = (l.x + l.dx * t) * size;
      const py = (l.y + l.dy * t) * size;
      // taper the ends so scratches look natural
      const taper = Math.sin(t * Math.PI) ** 0.5;
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          const ix = Math.round(px) + ox;
          const iy = Math.round(py) + oy;
          const d = Math.hypot(ix - px, iy - py);
          if (d > w) continue;
          const i = (((iy % size) + size) % size) * size + (((ix % size) + size) % size);
          buf[i] = Math.max(buf[i], (1 - d / w) * l.a * taper);
        }
    }
  }
  return buf;
}

const sampleBuf = (buf: Float32Array, size: number) => (u: number, v: number) => buf[Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))];

export const GENERATORS: GeneratorDef[] = [
  // ------------------------------------------------------------ noises
  {
    id: 'noise',
    label: 'Ruído fractal',
    group: 'Ruídos',
    nums: [N('scale', 'Escala', 1, 32, 4), N('octaves', 'Oitavas', 1, 8, 5), N('persistence', 'Persistência', 0.2, 0.8, 0.5, 0.05), N('stretch', 'Estiramento', 1, 16, 1), SEED],
    prepare: (p) => (u, v) => fbm(u, v, n(p, 'scale'), n(p, 'octaves'), n(p, 'persistence'), n(p, 'seed'), 1, n(p, 'stretch')),
  },
  {
    id: 'cells',
    label: 'Células (Voronoi)',
    group: 'Ruídos',
    nums: [N('scale', 'Células', 2, 64, 10), N('jitter', 'Irregularidade', 0, 1, 1, 0.05), SEED],
    choices: [{ key: 'mode', label: 'Modo', options: [['f1', 'Distância'], ['edge', 'Bordas'], ['id', 'Aleatório por célula']], value: 'f1' }],
    prepare: (p) => (u, v) => {
      const w = worley(u, v, n(p, 'scale'), n(p, 'seed'), n(p, 'jitter'));
      if (p.mode === 'edge') return clamp01((w.f2 - w.f1) * 2.5);
      if (p.mode === 'id') return w.id;
      return clamp01(w.f1);
    },
  },
  {
    id: 'grunge',
    label: 'Grunge / sujeira',
    group: 'Desgaste',
    nums: [N('scale', 'Escala', 1, 16, 3), N('coverage', 'Cobertura', 0, 1, 0.45, 0.05), N('sharpness', 'Nitidez', 1, 12, 4, 0.5), SEED],
    prepare: (p) => (u, v) => {
      const a = fbm(u, v, n(p, 'scale'), 6, 0.55, n(p, 'seed'));
      const b = fbm(u, v, n(p, 'scale') * 4, 3, 0.5, n(p, 'seed') + 9);
      const x = a * 0.75 + b * 0.25;
      return clamp01((x - (1 - n(p, 'coverage'))) * n(p, 'sharpness') + 0.5);
    },
  },
  {
    id: 'spots',
    label: 'Manchas',
    group: 'Desgaste',
    nums: [N('scale', 'Escala', 2, 32, 8), N('coverage', 'Cobertura', 0, 1, 0.3, 0.05), N('softness', 'Suavidade', 0.01, 0.5, 0.12, 0.01), SEED],
    prepare: (p) => (u, v) => {
      const w = worley(u, v, n(p, 'scale'), n(p, 'seed'));
      const r = n(p, 'coverage') * 0.75 * (0.6 + fbm(u, v, n(p, 'scale'), 3, 0.5, n(p, 'seed') + 3) * 0.8);
      return 1 - smooth(r - n(p, 'softness'), r + n(p, 'softness'), w.f1);
    },
  },
  {
    id: 'scratches',
    label: 'Arranhões',
    group: 'Desgaste',
    nums: [N('count', 'Quantidade', 5, 600, 120), N('length', 'Comprimento', 0.01, 0.4, 0.12, 0.01), N('width', 'Espessura', 0.0005, 0.006, 0.0015, 0.0005), N('angle', 'Ângulo', 0, 180, 30), N('variance', 'Variação de ângulo', 0, 180, 60), SEED],
    prepare: (p, size) => {
      let s = n(p, 'seed') * 7919;
      const r = () => hash2(s++, 17, n(p, 'seed'));
      const lines = Array.from({ length: n(p, 'count') }, () => {
        const a = ((n(p, 'angle') + (r() - 0.5) * n(p, 'variance')) * Math.PI) / 180;
        const l = n(p, 'length') * (0.3 + r() * 1.2);
        return { x: r(), y: r(), dx: Math.cos(a) * l, dy: Math.sin(a) * l, w: n(p, 'width') * (0.5 + r()), a: 0.4 + r() * 0.6 };
      });
      return sampleBuf(rasterLines(size, lines), size);
    },
  },
  {
    id: 'rust',
    label: 'Ferrugem',
    group: 'Desgaste',
    nums: [N('scale', 'Escala', 1, 16, 4), N('coverage', 'Cobertura', 0, 1, 0.4, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const base = fbm(u, v, n(p, 'scale'), 6, 0.6, n(p, 'seed'));
      const pits = worley(u, v, n(p, 'scale') * 6, n(p, 'seed') + 5).f1;
      const x = base * 0.8 + (1 - pits) * 0.2;
      return smooth(1 - n(p, 'coverage') - 0.05, 1 - n(p, 'coverage') + 0.12, x);
    },
  },
  {
    id: 'cracks',
    label: 'Rachaduras',
    group: 'Desgaste',
    nums: [N('scale', 'Escala', 2, 32, 6), N('width', 'Espessura', 0.01, 0.2, 0.05, 0.01), SEED],
    prepare: (p) => (u, v) => {
      const wu = u + (fbm(u, v, 4, 3, 0.5, n(p, 'seed') + 1) - 0.5) * 0.06;
      const wv = v + (fbm(u, v, 4, 3, 0.5, n(p, 'seed') + 2) - 0.5) * 0.06;
      const w = worley(frac(wu), frac(wv), n(p, 'scale'), n(p, 'seed'));
      return 1 - smooth(0, n(p, 'width'), w.f2 - w.f1);
    },
  },
  // ------------------------------------------------------------ surfaces
  {
    id: 'brushed',
    label: 'Metal escovado',
    group: 'Superfícies',
    nums: [N('density', 'Densidade', 32, 512, 200, 8), N('variation', 'Variação', 0, 1, 0.5, 0.05), SEED],
    choices: [{ key: 'dir', label: 'Direção', options: [['h', 'Horizontal'], ['v', 'Vertical']], value: 'h' }],
    prepare: (p) => (u, v) => {
      const [a, b] = p.dir === 'v' ? [u, v] : [v, u];
      const fine = valueNoise(a, b, n(p, 'density'), 2, n(p, 'seed'));
      const fine2 = valueNoise(a, b, n(p, 'density') * 2, 4, n(p, 'seed') + 3);
      const broad = fbm(u, v, 3, 3, 0.5, n(p, 'seed') + 5);
      return clamp01(fine * 0.55 + fine2 * 0.3 + 0.15 + (broad - 0.5) * n(p, 'variation') * 0.6);
    },
  },
  {
    id: 'wood',
    label: 'Madeira',
    group: 'Superfícies',
    nums: [N('rings', 'Anéis', 2, 40, 10), N('warp', 'Distorção', 0, 3, 1.2, 0.1), N('grain', 'Fibras', 32, 512, 160, 8), SEED],
    prepare: (p) => (u, v) => {
      const w = fbm(u, v, 2, 4, 0.5, n(p, 'seed')) * n(p, 'warp');
      const ring = 0.5 + 0.5 * Math.sin((u * n(p, 'rings') + w) * Math.PI * 2);
      const fibre = valueNoise(u, v, n(p, 'grain'), 3, n(p, 'seed') + 4);
      return clamp01(Math.pow(ring, 1.6) * 0.65 + fibre * 0.35);
    },
  },
  {
    id: 'leather',
    label: 'Couro',
    group: 'Superfícies',
    nums: [N('scale', 'Poros', 8, 96, 36), SEED],
    prepare: (p) => (u, v) => {
      const w = worley(u, v, n(p, 'scale'), n(p, 'seed'));
      const wrinkles = fbm(u, v, 6, 4, 0.5, n(p, 'seed') + 1);
      return clamp01(smooth(0, 0.7, w.f1) * 0.75 + wrinkles * 0.25);
    },
  },
  {
    id: 'weave',
    label: 'Tecido',
    group: 'Superfícies',
    nums: [N('scale', 'Fios', 8, 128, 48)],
    prepare: (p) => (u, v) => {
      const s = n(p, 'scale');
      const x = u * s;
      const y = v * s;
      const over = (Math.floor(x) + Math.floor(y)) % 2 === 0;
      const along = over ? frac(y) : frac(x);
      const across = over ? frac(x) : frac(y);
      return clamp01(Math.sin(across * Math.PI) * (0.75 + 0.25 * Math.sin(along * Math.PI)));
    },
  },
  {
    id: 'carbon',
    label: 'Fibra de carbono',
    group: 'Industriais',
    nums: [N('scale', 'Trama', 4, 64, 16, 4)],
    prepare: (p) => (u, v) => {
      // 2×2 twill: tows alternate direction diagonally.
      const s = n(p, 'scale');
      const x = u * s;
      const y = v * s;
      const twill = (Math.floor(x) + Math.floor(y)) % 4 < 2; // 2×2 twill: direction alternates along diagonals
      const across = twill ? frac(y) : frac(x);
      const along = twill ? frac(x) : frac(y);
      const tow = Math.sin(across * Math.PI) ** 0.6;
      return clamp01((twill ? 0.55 : 0.35) + tow * 0.4 + (along - 0.5) * 0.05);
    },
  },
  {
    id: 'knurling',
    label: 'Recartilhado',
    group: 'Industriais',
    nums: [N('scale', 'Densidade', 8, 128, 40)],
    prepare: (p) => (u, v) => {
      const s = n(p, 'scale');
      const a = Math.abs(frac((u + v) * s) - 0.5) * 2;
      const b = Math.abs(frac((u - v) * s) - 0.5) * 2;
      return clamp01(1 - Math.max(a, b));
    },
  },
  {
    id: 'diamond-plate',
    label: 'Chapa xadrez',
    group: 'Industriais',
    nums: [N('scale', 'Escala', 2, 24, 8)],
    prepare: (p) => (u, v) => {
      const s = n(p, 'scale');
      const x = u * s;
      const y = v * s;
      const alt = (Math.floor(x) + Math.floor(y)) % 2 === 0;
      let lx = frac(x) - 0.5;
      let ly = frac(y) - 0.5;
      if (!alt) [lx, ly] = [ly, -lx];
      // rotated elongated ridge
      const c = Math.SQRT1_2;
      const rx = (lx + ly) * c;
      const ry = (ly - lx) * c;
      const d = Math.hypot(rx / 0.36, ry / 0.08);
      return clamp01(1 - smooth(0.6, 1, d));
    },
  },
  {
    id: 'hex',
    label: 'Hexágonos',
    group: 'Geométricos',
    nums: [N('scale', 'Escala', 2, 32, 8), N('gap', 'Junta', 0, 0.3, 0.06, 0.01)],
    prepare: (p) => {
      const s = Math.round(n(p, 'scale'));
      const H = Math.sqrt(3) / 2;
      // Even number of rows so the staggered layout repeats; rows are slightly stretched to fill the square.
      const R = Math.max(2, Math.round((s / H) / 2) * 2);
      const W = s;
      const Hh = R * H;
      const wrapd = (d: number, per: number) => d - Math.round(d / per) * per;
      return (u, v) => {
        const x = u * W;
        const y = v * Hh;
        const r0 = Math.round(y / H);
        let best = 9;
        for (let r = r0 - 1; r <= r0 + 1; r++) {
          const off = (((r % R) + R) % R) % 2 ? 0.5 : 0;
          for (let q = Math.floor(x) - 1; q <= Math.floor(x) + 1; q++) {
            const dx = Math.abs(wrapd(x - (q + off), W));
            const dy = Math.abs(wrapd(y - r * H, Hh));
            best = Math.min(best, Math.max(dx, dx * 0.5 + dy * H)); // pointy-top hex distance, 0.5 at the edge
          }
        }
        const g = n(p, 'gap') * 0.5;
        return 1 - smooth(0.5 - g - 0.015, 0.5 - g + 0.015, best);
      };
    },
  },
  {
    id: 'plates',
    label: 'Placas / painéis',
    group: 'Geométricos',
    nums: [N('cols', 'Colunas', 1, 16, 4), N('rows', 'Linhas', 1, 16, 4), N('gap', 'Junta', 0, 0.1, 0.012, 0.002), N('bevel', 'Chanfro', 0, 0.2, 0.04, 0.005), N('offset', 'Deslocar linhas', 0, 0.5, 0, 0.05)],
    prepare: (p) => (u, v) => {
      const rows = n(p, 'rows');
      const cols = n(p, 'cols');
      const row = Math.floor(v * rows);
      const x = frac(u * cols + (row % 2) * n(p, 'offset'));
      const y = frac(v * rows);
      const d = Math.min(x, 1 - x, y, 1 - y) / Math.max(cols, rows) * Math.min(cols, rows);
      const g = n(p, 'gap') * Math.min(cols, rows);
      if (d < g) return 0;
      return clamp01(smooth(g, g + n(p, 'bevel') * Math.min(cols, rows) + 1e-4, d) * 0.85 + 0.15);
    },
  },
  {
    id: 'stripes',
    label: 'Listras',
    group: 'Geométricos',
    nums: [N('count', 'Quantidade', 1, 64, 8), N('width', 'Largura', 0.05, 0.95, 0.5, 0.05), N('soft', 'Suavidade', 0, 0.5, 0.05, 0.01)],
    choices: [{ key: 'dir', label: 'Direção', options: [['h', 'Horizontal'], ['v', 'Vertical'], ['d', 'Diagonal']], value: 'd' }],
    prepare: (p) => (u, v) => {
      const t = p.dir === 'h' ? v : p.dir === 'v' ? u : u + v;
      const f = frac(t * n(p, 'count'));
      const w = n(p, 'width');
      const s = n(p, 'soft') + 1e-4;
      return smooth(0, s, f) * (1 - smooth(w, w + s, f));
    },
  },
  {
    id: 'checker',
    label: 'Xadrez',
    group: 'Geométricos',
    nums: [N('count', 'Quadros', 2, 64, 8, 2)],
    prepare: (p) => (u, v) => ((Math.floor(u * n(p, 'count')) + Math.floor(v * n(p, 'count'))) % 2 ? 1 : 0),
  },
  {
    id: 'dots',
    label: 'Pontos / rebites',
    group: 'Geométricos',
    nums: [N('count', 'Por linha', 1, 64, 8), N('radius', 'Raio', 0.05, 0.5, 0.18, 0.01), N('soft', 'Arredondamento', 0, 1, 0.8, 0.05)],
    prepare: (p) => (u, v) => {
      const c = n(p, 'count');
      const d = Math.hypot(frac(u * c) - 0.5, frac(v * c) - 0.5) / n(p, 'radius');
      if (d >= 1) return 0;
      const dome = Math.sqrt(1 - d * d);
      return dome * n(p, 'soft') + (1 - n(p, 'soft'));
    },
  },
  {
    id: 'gradient',
    label: 'Gradiente',
    group: 'Geométricos',
    nums: [],
    choices: [{ key: 'dir', label: 'Direção', options: [['h', 'Horizontal'], ['v', 'Vertical'], ['r', 'Radial']], value: 'v' }],
    prepare: (p) => (u, v) => (p.dir === 'h' ? u : p.dir === 'v' ? 1 - v : clamp01(1 - Math.hypot(u - 0.5, v - 0.5) * 2)),
  },
  {
    id: 'camo',
    label: 'Camuflagem',
    group: 'Superfícies',
    nums: [N('scale', 'Escala', 1, 12, 3), N('levels', 'Cores', 2, 4, 4), SEED],
    choices: [{ key: 'style', label: 'Estilo', options: [['woodland', 'Woodland'], ['digital', 'Digital'], ['tiger', 'Tiger stripe']], value: 'woodland' }],
    prepare: (p) => (u, v) => {
      const L = n(p, 'levels');
      let uu = u;
      let vv = v;
      if (p.style === 'digital') {
        const q = 64;
        uu = Math.floor(u * q) / q;
        vv = Math.floor(v * q) / q;
      }
      const a = fbm(uu, vv, n(p, 'scale'), 4, 0.5, n(p, 'seed'));
      const b = fbm(uu, vv, n(p, 'scale') + 1, 4, 0.5, n(p, 'seed') + 31);
      const x = p.style === 'tiger' ? 0.5 + 0.5 * Math.sin((vv * n(p, 'scale') * 2 + a * 1.4) * Math.PI * 2) * 0.9 + (b - 0.5) * 0.4 : a * 0.6 + b * 0.4;
      return Math.min(L - 1, Math.floor(clamp01((x - 0.3) / 0.4) * L)) / (L - 1);
    },
  },
  {
    id: 'perforated',
    label: 'Chapa perfurada',
    group: 'Industriais',
    nums: [N('count', 'Furos por linha', 2, 64, 12), N('radius', 'Raio', 0.1, 0.45, 0.3, 0.01)],
    prepare: (p) => (u, v) => {
      const c = n(p, 'count');
      const row = Math.floor(v * c);
      const x = frac(u * c + (row % 2) * 0.5) - 0.5;
      const y = frac(v * c) - 0.5;
      return smooth(n(p, 'radius') - 0.03, n(p, 'radius') + 0.03, Math.hypot(x, y));
    },
  },
];

export const GEN_BY_ID = new Map(GENERATORS.map((g) => [g.id, g]));

export function defaultGenParams(id: string): Params {
  const g = GEN_BY_ID.get(id);
  const p: Params = {};
  if (!g) return p;
  for (const x of g.nums) p[x.key] = x.value;
  for (const c of g.choices ?? []) p[c.key] = c.value;
  return p;
}
