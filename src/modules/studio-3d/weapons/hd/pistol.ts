import type { Params, WeaponPart } from '../catalog';
import { alongX, B, pinZ, place, serrations, side, T, tubeX, turnX, type V2 } from './kit';

/**
 * Compact striker-fired 9 mm pistol, high detail (generic polymer-frame design, ~187 mm long).
 * The slide is split left/right so the ejection port is a real opening over the barrel hood;
 * the slide front has a real muzzle opening showing the barrel crown and recoil spring guide.
 */
const n = (p: Params, k: string) => Number(p[k]);
const s = (p: Params, k: string) => String(p[k]);

export function buildPistolHD(p: Params): WeaponPart[] {
  const parts: WeaponPart[] = [];
  const add = (name: string, slot: WeaponPart['slot'], mesh: WeaponPart['mesh'], shading: WeaponPart['shading'] = 'auto') => parts.push({ name, slot, mesh, shading });
  const L = n(p, 'slide'); // slide length
  const SW = 0.0127; // slide half width
  const top = 0.0165;
  const bot = -0.0125;

  // ------------------------------------------------------------------ slide
  const front = L - 0.012;
  const slideOutline: V2[] = [
    [0, bot],
    [front, bot],
    [front, top - 0.0015],
    [front - 0.002, top],
    [0.004, top],
    [0, top - 0.003],
  ];
  const port = B.roundedRect(0.04, 0.0145, 0.0012, 2, 0.092, 0.0068);
  add('Ferrolho (esq.)', 'dark', side(slideOutline, -SW, 0, 0.0016, [], 3));
  add('Ferrolho (dir.)', 'dark', side(slideOutline, 0, SW, 0.0016, [port], 3));
  // slide nose with the muzzle opening and the recoil spring opening
  const nose: V2[] = [[-SW + 0.0015, bot - 0.0023], [SW - 0.0015, bot - 0.0023], [SW, bot - 0.0008], [SW, top - 0.002], [SW - 0.0025, top], [-SW + 0.0025, top], [-SW, top - 0.002], [-SW, bot - 0.0008]];
  add('Frente do ferrolho', 'dark', alongX(nose, front - 0.0005, L, 0.0016, [B.circle(0.0071, 24, 0, 0), B.circle(0.0029, 16, 0, -0.0105)], 2));
  add('Serrilhas traseiras', 'dark', serrations(0.006, 0.036, s(p, 'serr') === 'nao' ? 0 : 8, bot + 0.004, top - 0.004, SW));
  if (s(p, 'serr') === 'frente') add('Serrilhas frontais', 'dark', serrations(L - 0.05, L - 0.02, 6, bot + 0.004, top - 0.004, SW));
  add('Extrator', 'dark', side(B.roundedRect(0.02, 0.0035, 0.001, 2, 0.122, 0.009), SW - 0.0003, SW + 0.0006, 0.0003, [], 1));
  add('Tampa traseira', 'polymer', alongX(B.roundedRect(0.016, 0.018, 0.002, 2, 0, 0.002), -0.0006, 0.0004, 0.0003));

  // sights with tritium dots
  const rear: V2[] = [[-0.0065, 0], [0.0065, 0], [0.0062, 0.0058], [0.0014, 0.0058], [0.0014, 0.0028], [-0.0014, 0.0028], [-0.0014, 0.0058], [-0.0062, 0.0058]];
  add('Alça de mira', 'dark', alongX(rear.map(([z, y]) => [z, top + y] as V2), 0.006, 0.016, 0.0006));
  add('Massa de mira', 'dark', alongX(B.roundedRect(0.0034, 0.0055, 0.0006, 2, 0, top + 0.00275), front - 0.008, front - 0.003, 0.0005));
  add('Pontos luminosos', 'glow', B.merge(
    alongX(B.circle(0.00085, 12, 0.0038, top + 0.0042), 0.0057, 0.0062),
    alongX(B.circle(0.00085, 12, -0.0038, top + 0.0042), 0.0057, 0.0062),
    alongX(B.circle(0.00085, 12, 0, top + 0.0038), front - 0.0083, front - 0.0078),
  ));

  // ------------------------------------------------------------------ barrel (hood visible in the port, crown at the muzzle)
  add('Cano', 'dark', B.merge(
    side(B.roundedRect(0.042, 0.011, 0.0015, 2, 0.092, 0.006), -0.0074, 0.0074, 0.001),
    tubeX([[0.0045, 0.07], [0.0068, 0.07], [0.0068, L - 0.0005], [0.0058, L], [0.0045, L]], 0, 0, 32),
  ));
  add('Guia da mola', 'polymer', turnX([[0, front - 0.03], [0.0026, front - 0.03], [0.0026, L - 0.002], [0.002, L - 0.0015], [0, L - 0.0015]], -0.0105, 0, 16));

  // ------------------------------------------------------------------ frame
  const g = (n(p, 'grip') * Math.PI) / 180; // grip angle
  const gl = n(p, 'gripLen');
  const dx = Math.tan(g);
  const gy0 = -0.03;
  const gy1 = gy0 - gl;
  // finger grooves on the front strap
  const strap: V2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const y = gy0 - t * gl;
    const bump = s(p, 'grooves') === 'sim' && t > 0.15 && t < 0.85 ? Math.max(0, Math.sin(((t - 0.15) / 0.7) * Math.PI * 3)) * 0.0018 : 0;
    strap.push([0.05 - (y - gy0) * -dx + bump - 0.002, y]);
  }
  const frameOutline: V2[] = [
    [0.012, bot - 0.0003],
    [front - 0.004, bot - 0.0003],
    [front - 0.004, -0.024],
    [0.124, -0.0255],
    [0.118, -0.0285],
    [0.114, -0.044],
    [0.108, -0.051],
    [0.094, -0.0535],
    [0.064, -0.0535],
    [0.056, -0.047],
    [0.053, gy0 - 0.004],
    ...strap.slice(1),
    [0.05 - gl * dx - 0.004, gy1 - 0.001],
    [0.012 - gl * dx - 0.006, gy1 - 0.001],
    [0.006 - gl * dx - 0.007, gy1 + 0.004],
    [0.004 - (gl * 0.15) * dx - 0.006, gy0 - gl * 0.15],
    [0.002, -0.024],
    [-0.008, -0.019],
    [-0.006, -0.0155],
    [0.004, bot - 0.0003],
  ];
  const guardHole: V2[] = [[0.066, -0.028], [0.108, -0.028], [0.11, -0.04], [0.104, -0.0475], [0.07, -0.048], [0.06, -0.04]];
  add('Armação', 'polymer', side(frameOutline, -0.0118, 0.0118, 0.003, [guardHole], 3));
  add('Trilho da armação', 'polymer', B.merge(...[0.132, 0.142, 0.152].map((x) => side(B.roundedRect(0.005, 0.003, 0.0006, 1, x, -0.0255), -0.0105, 0.0105, 0.0004, [], 1))));
  // grip texture panels (stippled)
  const panel: V2[] = [
    [0.044 + 0.002, gy0 - 0.006],
    [0.046 - gl * 0.85 * dx, gy0 - gl * 0.88],
    [0.012 - gl * 0.85 * dx, gy0 - gl * 0.88],
    [0.008 - 0.004, gy0 - 0.006],
  ];
  add('Textura da empunhadura', 'grip', B.merge(side(panel, 0.0115, 0.0124, 0.0004, [], 1), side(panel, -0.0124, -0.0115, 0.0004, [], 1)));

  // ------------------------------------------------------------------ controls
  add('Gatilho', 'polymer', side([[0.084, -0.028], [0.088, -0.028], [0.0885, -0.035], [0.086, -0.042], [0.081, -0.045], [0.083, -0.038], [0.0835, -0.032]], -0.0028, 0.0028, 0.0005));
  add('Tecla de segurança', 'dark', side([[0.0845, -0.034], [0.0865, -0.034], [0.085, -0.0415], [0.0832, -0.0415]], -0.0007, 0.0007, 0.0002));
  add('Retém do ferrolho', 'dark', side([[0.094, -0.0135], [0.108, -0.0135], [0.109, -0.0165], [0.095, -0.0165]], -0.0128, -0.0116, 0.0004));
  add('Alavanca de desmontagem', 'dark', B.merge(side(B.roundedRect(0.008, 0.0045, 0.001, 2, 0.118, -0.0165), 0.0114, 0.0124, 0.0003), side(B.roundedRect(0.008, 0.0045, 0.001, 2, 0.118, -0.0165), -0.0124, -0.0114, 0.0003)));
  add('Botão do carregador', 'polymer', B.merge(side(B.roundedRect(0.006, 0.006, 0.0015, 2, 0.056, -0.034), -0.0127, -0.011, 0.0005)));
  add('Pinos da armação', 'dark', B.merge(...[[0.102, -0.018], [0.03, -0.021]].flatMap(([x, y]) => [pinZ(x, y, 0.0119, 0.0016, 0.0006), pinZ(x, y, -0.0119, 0.0016, 0.0006)])));

  // ------------------------------------------------------------------ magazine baseplate
  const bx = 0.03 - gl * dx;
  add('Base do carregador', 'polymer', place(side(B.roundedRect(0.042, 0.0065, 0.002, 2, 0, 0), -0.0118, 0.0118, 0.0018), T.at(bx, gy1 - 0.0045, 0), T.rz(-g * 0.4)));
  if (s(p, 'light') === 'sim')
    add('Lanterna tática', 'anodized', B.merge(side(B.roundedRect(0.06, 0.018, 0.004, 3, 0.14, -0.037), -0.0125, 0.0125, 0.003), turnX([[0, 0.168], [0.0105, 0.168], [0.0105, 0.172], [0, 0.172]], -0.037, 0, 24)));
  if (s(p, 'light') === 'sim') add('Lente da lanterna', 'lens', turnX([[0, 0.1715], [0.009, 0.1715], [0.009, 0.1725], [0, 0.1725]], -0.037, 0, 24));
  if (s(p, 'suppressor') === 'sim')
    add('Supressor', 'dark', B.merge(tubeX([[0.0045, L], [0.0088, L], [0.0088, L + 0.012], [0.0045, L + 0.012]], 0, 0, 24), tubeX([[0.0052, L + 0.012], [0.016, L + 0.012], [0.017, L + 0.016], [0.017, L + 0.155], [0.016, L + 0.16], [0.0052, L + 0.16]], 0, 0, 36)));
  return parts;
}
