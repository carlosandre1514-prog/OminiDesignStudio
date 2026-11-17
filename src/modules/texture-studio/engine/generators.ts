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
  group: 'Ruídos' | 'Superfícies' | 'Desgaste' | 'Geométricos' | 'Industriais' | 'Orgânicos';
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
  // ------------------------------------------------------------ organic: skin & animals
  {
    id: 'skin-pores',
    label: 'Pele (poros e microrrugas)',
    group: 'Orgânicos',
    nums: [N('scale', 'Poros', 40, 240, 120), N('depth', 'Profundidade dos poros', 0, 1, 0.6, 0.05), N('wrinkles', 'Microrrugas', 0, 1, 0.45, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const w = worley(u, v, Math.round(n(p, 'scale')), sd, 0.9);
      // pores: small round dimples of varying size
      const r = 0.12 + w.id * 0.16;
      const pore = 1 - smooth(r * 0.4, r, w.f1);
      // micro wrinkles: two crossing ridged directional noises
      const a = 1 - Math.abs(fbm(u, v, 24, 3, 0.5, sd + 5, 4, 1) * 2 - 1);
      const b = 1 - Math.abs(fbm(u, v, 24, 3, 0.5, sd + 9, 1, 4) * 2 - 1);
      const lines = Math.max(smooth(0.86, 1, a), smooth(0.86, 1, b));
      const base = 0.62 + (fbm(u, v, 6, 4, 0.5, sd + 2) - 0.5) * 0.3;
      return clamp01(base - pore * n(p, 'depth') * 0.45 - lines * n(p, 'wrinkles') * 0.25);
    },
  },
  {
    id: 'freckles',
    label: 'Sardas / pintas',
    group: 'Orgânicos',
    nums: [N('scale', 'Tamanho (inverso)', 8, 120, 48), N('density', 'Densidade', 0, 1, 0.35, 0.05), N('cluster', 'Agrupamento', 0, 1, 0.6, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const w = worley(u, v, Math.round(n(p, 'scale')), sd, 1);
      // freckles gather in patches (cheeks, shoulders)
      const patch = smooth(0.35, 0.75, fbm(u, v, 3, 3, 0.5, sd + 3)) * n(p, 'cluster') + (1 - n(p, 'cluster'));
      const on = w.id < n(p, 'density') * patch ? 1 : 0;
      const r = 0.12 + hash2(Math.floor(w.id * 9973), 3, sd) * 0.2;
      return on * (1 - smooth(r * 0.5, r, w.f1)) * (0.6 + w.id * 0.4 / Math.max(0.05, n(p, 'density')) * 0.4);
    },
  },
  {
    id: 'wrinkles',
    label: 'Rugas / dobras',
    group: 'Orgânicos',
    nums: [N('scale', 'Escala', 2, 24, 6), N('stretch', 'Direção (estiramento)', 1, 8, 3), N('sharpness', 'Nitidez', 1, 8, 3, 0.5), SEED],
    prepare: (p) => (u, v) => {
      const r = 1 - Math.abs(fbm(u, v, n(p, 'scale'), 5, 0.5, n(p, 'seed'), 1, n(p, 'stretch')) * 2 - 1);
      return clamp01(Math.pow(r, n(p, 'sharpness')));
    },
  },
  {
    id: 'scales',
    label: 'Escamas',
    group: 'Orgânicos',
    nums: [N('scale', 'Escamas', 4, 64, 16), N('bevel', 'Arredondamento', 0.05, 0.6, 0.3, 0.05), N('irregular', 'Irregularidade', 0, 1, 0.35, 0.05), SEED],
    choices: [{ key: 'kind', label: 'Tipo', options: [['reptile', 'Réptil / crocodilo (placas)'], ['fish', 'Peixe / cobra (sobrepostas)']], value: 'reptile' }],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const sc = Math.max(2, Math.round(n(p, 'scale') / 2) * 2);
      if (p.kind === 'fish') {
        // overlapping round scales: rows hang over the next one (like roof tiles)
        const x = u * sc;
        const y = v * sc;
        let best = -1;
        let val = 0;
        for (let r = Math.floor(y) - 1; r <= Math.floor(y) + 1; r++) {
          const off = (((r % 2) + 2) % 2) * 0.5;
          for (let c = Math.floor(x - off) - 1; c <= Math.floor(x - off) + 1; c++) {
            const cx = c + 0.5 + off;
            const cy = r;
            const d = Math.hypot(x - cx, (y - cy) * 1.1);
            if (d < 0.72 && r > best) {
              best = r;
              const t = d / 0.72;
              val = 1 - t * t * (0.6 + n(p, 'bevel')) + (hash2(((c % sc) + sc) % sc, ((r % sc) + sc) % sc, sd) - 0.5) * n(p, 'irregular') * 0.3;
            }
          }
        }
        return clamp01(val);
      }
      const w = worley(u, v, sc, sd, 0.15 + n(p, 'irregular') * 0.7);
      const plate = smooth(0, n(p, 'bevel'), w.f2 - w.f1);
      return clamp01(plate * (0.75 + w.id * 0.25) + (fbm(u, v, sc * 2, 2, 0.5, sd + 4) - 0.5) * 0.15);
    },
  },
  {
    id: 'fur',
    label: 'Pelos',
    group: 'Orgânicos',
    nums: [N('density', 'Densidade', 8, 96, 40), N('length', 'Comprimento', 2, 16, 8), N('flow', 'Ondulação', 0, 1, 0.35, 0.05), N('clumps', 'Tufos', 0, 1, 0.5, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      // strands: fine noise stretched along v, combed by a slow warp
      const warp = (fbm(u, v, 2, 3, 0.5, sd + 1) - 0.5) * n(p, 'flow') * 0.15;
      const den = Math.max(1, Math.round(n(p, 'density')));
      const len = Math.max(1, Math.round(den / n(p, 'length')));
      const s1 = valueNoise(u + warp, v, den * 4, len, sd);
      const s2 = valueNoise(u + warp * 1.3, v, den * 8, len * 2, sd + 7);
      const strands = clamp01((s1 * 0.6 + s2 * 0.4 - 0.25) * 1.8);
      const clump = 1 - n(p, 'clumps') * 0.6 * smooth(0.4, 0.75, worley(u + warp, v, Math.max(2, Math.round(den / 6)), sd + 3, 1).f1);
      return clamp01(strands * clump);
    },
  },
  {
    id: 'animal-stripes',
    label: 'Listras animais (tigre/zebra)',
    group: 'Orgânicos',
    nums: [N('count', 'Listras', 2, 24, 8), N('warp', 'Distorção', 0, 3, 1.2, 0.1), N('thickness', 'Espessura', 0.1, 0.9, 0.4, 0.05), N('breakup', 'Quebras', 0, 1, 0.5, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const w = (fbm(u, v, 3, 4, 0.5, sd) - 0.5) * n(p, 'warp');
      const s = 0.5 + 0.5 * Math.sin((u * Math.round(n(p, 'count')) + w) * Math.PI * 2);
      const br = fbm(u, v, 6, 3, 0.5, sd + 5);
      const t = n(p, 'thickness') + (br - 0.5) * n(p, 'breakup');
      return smooth(1 - t - 0.05, 1 - t + 0.05, s);
    },
  },
  {
    id: 'rosettes',
    label: 'Rosetas (onça/leopardo)',
    group: 'Orgânicos',
    nums: [N('scale', 'Rosetas', 3, 24, 9), N('ring', 'Anel', 0.05, 0.4, 0.16, 0.01), N('breakup', 'Quebras', 0, 1, 0.55, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const w = worley(u, v, Math.round(n(p, 'scale')), sd, 0.8);
      const r0 = 0.28 + w.id * 0.1;
      const band = smooth(r0 - n(p, 'ring'), r0 - n(p, 'ring') * 0.5, w.f1) * (1 - smooth(r0, r0 + 0.05, w.f1));
      const br = smooth(0.5 - n(p, 'breakup') * 0.3, 0.6, fbm(u, v, Math.round(n(p, 'scale')) * 3, 3, 0.5, sd + 2));
      const spot = (1 - smooth(0.08, 0.13, worley(u, v, Math.round(n(p, 'scale')) * 2, sd + 9, 1).f1)) * (w.f1 > r0 + 0.05 ? 1 : 0);
      return clamp01(band * br + spot);
    },
  },
  {
    id: 'feathers',
    label: 'Penas',
    group: 'Orgânicos',
    nums: [N('scale', 'Penas', 2, 16, 6), N('barbs', 'Barbas', 10, 80, 36), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const sc = Math.max(2, Math.round(n(p, 'scale') / 2) * 2);
      const x = u * sc;
      const y = v * sc;
      let val = 0.12;
      let best = -1;
      // each feather: rounded vane around a shaft, rows overlapping like scales
      for (let r = Math.floor(y) - 1; r <= Math.floor(y) + 1; r++) {
        const off = (((r % 2) + 2) % 2) * 0.5;
        for (let c = Math.floor(x - off) - 1; c <= Math.floor(x - off) + 1; c++) {
          const fx = x - (c + off);
          const fy = (y - r) / 1.6;
          if (fy < 0 || fy > 1 || fx < 0 || fx > 1) continue;
          const half = 0.48 * Math.pow(Math.sin(Math.PI * Math.min(1, fy * 1.05)), 0.6);
          const dx = Math.abs(fx - 0.5);
          if (dx > half || r < best) continue;
          best = r;
          const shaft = dx < 0.018 + 0.01 * (1 - fy) ? 1 : 0;
          const barb = 0.5 + 0.5 * Math.sin(2 * Math.PI * (fy * n(p, 'barbs') - dx * n(p, 'barbs') * 0.7));
          const tone = hash2(((c % sc) + sc) % sc, ((r % sc) + sc) % sc, sd);
          val = shaft ? 0.95 : 0.3 + barb * 0.35 + tone * 0.15 - (dx / Math.max(0.01, half)) * 0.15;
        }
      }
      return clamp01(val);
    },
  },
  {
    id: 'horn',
    label: 'Chifre / casco',
    group: 'Orgânicos',
    nums: [N('rings', 'Anéis de crescimento', 2, 40, 12), N('fibres', 'Fibras', 8, 128, 64), N('warp', 'Distorção', 0, 2, 0.6, 0.05), SEED],
    prepare: (p) => (u, v) => {
      const sd = n(p, 'seed');
      const w = (fbm(u, v, 3, 3, 0.5, sd) - 0.5) * n(p, 'warp');
      const ring = 0.5 + 0.5 * Math.sin((v * Math.round(n(p, 'rings')) + w) * Math.PI * 2);
      const fib = valueNoise(u, v, Math.round(n(p, 'fibres')), 2, sd + 3);
      return clamp01(ring * 0.55 + fib * 0.3 + fbm(u, v, 4, 3, 0.5, sd + 6) * 0.15);
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
