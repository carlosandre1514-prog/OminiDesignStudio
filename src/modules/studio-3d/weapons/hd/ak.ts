import type { Params, WeaponPart } from '../catalog';
import { alongX, B, pinZ, place, sector, side, T, top, tubeX, turnX, type V2 } from './kit';

/**
 * AKM-pattern rifle, high detail, real proportions (≈ 880 mm, 415 mm barrel).
 * x = 0 at the rear of the receiver, bore on y = 0.
 */
const n = (p: Params, k: string) => Number(p[k]);
const s = (p: Params, k: string) => String(p[k]);

export function buildAK(p: Params): WeaponPart[] {
  const parts: WeaponPart[] = [];
  const add = (name: string, slot: WeaponPart['slot'], mesh: WeaponPart['mesh'], shading: WeaponPart['shading'] = 'auto') => parts.push({ name, slot, mesh, shading });
  const RX = 0.25; // receiver length
  const HW = 0.0152; // receiver half width
  const barrel = n(p, 'barrel');
  const muzzle = RX + barrel;
  const wood = s(p, 'furniture') === 'madeira';
  const furn = wood ? 'wood' : 'polymer';

  // ------------------------------------------------------------------ receiver (stamped) + dust cover
  const recv: V2[] = [[0, -0.034], [0.235, -0.034], [0.248, -0.03], [RX, -0.022], [RX, 0.012], [0.004, 0.012], [0, 0.006]];
  const port = B.roundedRect(0.07, 0.013, 0.002, 2, 0.17, 0.004);
  add('Caixa da culatra (esq.)', 'dark', side(recv, -HW, 0, 0.0012));
  add('Caixa da culatra (dir.)', 'dark', side(recv, 0, HW, 0.0012, [port]));
  // stamped dimples / rivets typical of the AKM receiver
  add('Rebites', 'dark', B.merge(...[[0.02, -0.024], [0.205, -0.024], [0.215, -0.012], [0.225, -0.024], [0.06, -0.027], [0.11, -0.027]].flatMap(([x, y]) => [pinZ(x, y, HW + 0.0003, 0.0022, 0.0008, 12), pinZ(x, y, -HW - 0.0003, 0.0022, 0.0008, 12)])));
  add('Rebaixo do retém', 'dark', B.merge(side(B.roundedRect(0.03, 0.009, 0.003, 3, 0.072, -0.018), HW - 0.0007, HW + 0.0001, 0.0003, [], 1), side(B.roundedRect(0.03, 0.009, 0.003, 3, 0.072, -0.018), -HW - 0.0001, -HW + 0.0007, 0.0003, [], 1)));
  const cover: V2[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    cover.push([Math.cos(a) * 0.0142, 0.012 + Math.sin(a) * 0.0118]);
  }
  add('Tampa da caixa', 'dark', alongX(cover, 0.002, 0.236, 0.0008));
  add('Nervuras da tampa', 'dark', B.merge(...[0.02, 0.06, 0.1, 0.14, 0.18].map((x) => alongX(cover.map(([z, y]) => [z * 1.03, 0.012 + (y - 0.012) * 1.03] as V2), x, x + 0.004, 0.0004))));
  add('Ferrolho e porta-ferrolho', 'bright', B.merge(turnX([[0.0068, 0.13], [0.0068, 0.215], [0, 0.216]], 0.004, 0, 20), side(B.roundedRect(0.08, 0.008, 0.002, 2, 0.17, 0.007), 0.002, 0.0118, 0.0006)));
  add('Alavanca de manejo', 'bright', B.merge(side([[0.198, 0.0], [0.212, 0.0], [0.212, 0.009], [0.198, 0.009]], HW, HW + 0.012, 0.0015), place(B.lathe([[0, 0], [0.0055, 0.002], [0.0062, 0.008], [0.004, 0.013], [0, 0.0135]], 18), T.at(0.205, 0.0045, HW + 0.012), T.rx(Math.PI / 2))));
  add('Seletor de tiro', 'dark', side([[0.03, -0.001], [0.158, -0.001], [0.164, -0.008], [0.148, -0.0105], [0.04, -0.0075], [0.028, -0.005]], HW + 0.0002, HW + 0.0022, 0.0007));
  add('Alça de mira (base)', 'dark', B.merge(side([[0.25, 0.012], [0.31, 0.012], [0.31, 0.026], [0.27, 0.03], [0.25, 0.03]], -0.0115, 0.0115, 0.0015), side([[0.258, 0.03], [0.302, 0.027], [0.302, 0.031], [0.26, 0.034]], -0.0085, 0.0085, 0.0008)));

  // ------------------------------------------------------------------ barrel, gas system, front sight, muzzle
  add('Cano', 'dark', tubeX([[0.0039, RX - 0.01], [0.0115, RX - 0.01], [0.0115, RX + 0.03], [0.0092, RX + 0.035], [0.0086, muzzle - 0.05], [0.0078, muzzle - 0.045], [0.0078, muzzle], [0.0039, muzzle]], 0, 0, 28));
  const gb = Math.min(muzzle - 0.11, RX + 0.23);
  add('Tubo de gás', 'dark', tubeX([[0.0085, RX + 0.06], [0.0112, RX + 0.06], [0.0112, gb + 0.02], [0.0085, gb + 0.02]], 0.0198, 0, 20));
  add('Bloco de gases', 'dark', side([[gb, -0.012], [gb + 0.036, -0.012], [gb + 0.04, -0.004], [gb + 0.04, 0.03], [gb + 0.01, 0.032], [gb, 0.028]], -0.0118, 0.0118, 0.002));
  const fs = muzzle - 0.045;
  add('Massa de mira', 'dark', B.merge(
    side([[fs - 0.012, -0.011], [fs + 0.018, -0.011], [fs + 0.018, 0.012], [fs + 0.005, 0.016], [fs - 0.012, 0.012]], -0.011, 0.011, 0.0015),
    // protective "ears" and the post
    side([[fs - 0.004, 0.012], [fs + 0.008, 0.012], [fs + 0.008, 0.042], [fs + 0.001, 0.044], [fs - 0.004, 0.038]], 0.006, 0.0095, 0.0006),
    side([[fs - 0.004, 0.012], [fs + 0.008, 0.012], [fs + 0.008, 0.042], [fs + 0.001, 0.044], [fs - 0.004, 0.038]], -0.0095, -0.006, 0.0006),
    place(B.lathe([[0, 0], [0.0017, 0], [0.0014, 0.024], [0, 0.0245]], 10), T.at(fs + 0.002, 0.014, 0)),
  ));
  if (s(p, 'muzzle') === 'slant') {
    add('Compensador inclinado', 'dark', B.merge(
      tubeX([[0.0042, muzzle - 0.002], [0.0105, muzzle - 0.002], [0.0105, muzzle + 0.022], [0.0042, muzzle + 0.022]], 0, 0, 24),
      alongX(sector(0.0055, 0.0105, -Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3, 10), muzzle + 0.022, muzzle + 0.034, 0.0004),
    ));
  } else {
    add('Freio de boca', 'dark', B.merge(tubeX([[0.0045, muzzle - 0.002], [0.0125, muzzle - 0.002], [0.0125, muzzle + 0.008], [0.0045, muzzle + 0.008]], 0, 0, 6), ...[0, 1].map((i) => tubeX([[0.0055, muzzle + 0.016 + i * 0.016], [0.0125, muzzle + 0.016 + i * 0.016], [0.0125, muzzle + 0.024 + i * 0.016], [0.0055, muzzle + 0.024 + i * 0.016]], 0, 0, 6)), alongX([[-0.0125, 0.004], [0.0125, 0.004], [0.0125, 0.0108], [-0.0125, 0.0108]], muzzle + 0.008, muzzle + 0.05, 0.0006), alongX([[-0.0125, -0.0108], [0.0125, -0.0108], [0.0125, -0.004], [-0.0125, -0.004]], muzzle + 0.008, muzzle + 0.05, 0.0006)));
  }
  add('Vareta de limpeza', 'dark', B.merge(turnX([[0, RX + 0.12], [0.0029, RX + 0.12], [0.0029, fs + 0.012], [0.0034, fs + 0.014], [0.0034, fs + 0.02], [0, fs + 0.021]], -0.0145, 0, 10)));

  // ------------------------------------------------------------------ handguards (wood or polymer)
  const lower: V2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI; // bottom half-ellipse
    lower.push([Math.cos(a) * 0.0215, -0.004 + Math.sin(a) * 0.028]);
  }
  lower.push([0.0215, 0.0085], [-0.0215, 0.0085]);
  const lgEnd = RX + 0.17;
  add('Guarda-mão inferior', furn, alongX(lower, RX + 0.005, lgEnd, 0.004, [], 2));
  add('Sulcos do guarda-mão', furn, B.merge(...[-1, 1].map((sz) => side(B.roundedRect(0.1, 0.005, 0.002, 3, RX + 0.09, -0.016), sz > 0 ? 0.0208 : -0.0222, sz > 0 ? 0.0222 : -0.0208, 0.0006))));
  add('Anel do guarda-mão', 'dark', tubeX([[0.0215, lgEnd], [0.0232, lgEnd], [0.0232, lgEnd + 0.008], [0.0215, lgEnd + 0.008]], -0.004, 0, 24));
  const upper: V2[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    upper.push([Math.cos(a) * 0.0165, 0.0195 + Math.sin(a) * 0.0145]);
  }
  upper.push([-0.0165, 0.0095], [0.0165, 0.0095]);
  add('Guarda-mão superior', furn, alongX(upper, RX + 0.065, gb - 0.004, 0.0035, [], 2));

  // ------------------------------------------------------------------ trigger group, grip, stock
  add('Guarda-mato', 'dark', side([[0.085, -0.034], [0.15, -0.034], [0.15, -0.039], [0.14, -0.052], [0.098, -0.054], [0.085, -0.044]], -0.0055, 0.0055, 0.0008, [[[0.09, -0.0365], [0.145, -0.0365], [0.137, -0.049], [0.1, -0.0505], [0.091, -0.042]]]));
  add('Gatilho', 'dark', side([[0.118, -0.033], [0.122, -0.033], [0.122, -0.04], [0.119, -0.047], [0.114, -0.049], [0.117, -0.042]], -0.0028, 0.0028, 0.0006));
  add('Retém do carregador', 'dark', side([[0.152, -0.034], [0.162, -0.034], [0.162, -0.046], [0.156, -0.05], [0.153, -0.046]], -0.0055, 0.0055, 0.0008));
  const gripLocal: V2[] = [[0.0155, 0], [0.0148, -0.03], [0.0158, -0.06], [0.0125, -0.088], [0.004, -0.095], [-0.009, -0.093], [-0.0165, -0.082], [-0.0175, -0.03], [-0.016, 0]];
  add('Empunhadura', wood ? 'wood' : 'polymer', B.merge(place(side(gripLocal, -0.0145, 0.0145, 0.0055, [], 3), T.at(0.064, -0.034, 0), T.rz(-0.3)), ...[0, 1, 2, 3, 4].map((i) => place(side(B.roundedRect(0.026, 0.0028, 0.0013, 2, 0, -0.025 - i * 0.012), 0.0143, 0.0151, 0.0003, [], 1), T.at(0.064, -0.034, 0), T.rz(-0.3)))));
  if (s(p, 'stock') === 'fixa') {
    const stock: V2[] = [[0, 0.008], [0, -0.034], [-0.035, -0.05], [-0.33, -0.112], [-0.352, -0.117], [-0.352, -0.012], [-0.33, -0.009], [-0.06, 0.006], [-0.02, 0.009]];
    add('Coronha', furn, side(stock, -0.0175, 0.0175, 0.0065, [], 3));
    add('Chapa da soleira', 'dark', side([[-0.352, -0.118], [-0.358, -0.118], [-0.36, -0.06], [-0.358, -0.011], [-0.352, -0.011]], -0.019, 0.019, 0.003, [], 2));
  } else if (s(p, 'stock') === 'dobravel') {
    const strut = (y0: number, y1: number) => B.merge(side([[0, y0], [-0.02, y0], [-0.27, y1], [-0.27, y1 + 0.006], [-0.02, y0 + 0.006], [0, y0 + 0.006]], -0.0055, 0.0055, 0.0012));
    add('Coronha rebatível', 'dark', B.merge(place(strut(-0.006, -0.024), T.at(0, 0, 0.011)), place(strut(-0.006, -0.024), T.at(0, 0, -0.011)), side([[-0.27, -0.028], [-0.285, -0.032], [-0.29, -0.098], [-0.276, -0.1], [-0.262, -0.07], [-0.262, -0.03]], -0.016, 0.016, 0.003), side([[-0.03, -0.034], [-0.255, -0.088], [-0.262, -0.082], [-0.035, -0.028]], -0.0035, 0.0035, 0.0012)));
  }

  // ------------------------------------------------------------------ magazine ("banana")
  const magSecs: [number, number, number][][] = [];
  const L = n(p, 'magLen');
  const outline = (): V2[] => {
    const pts: V2[] = [];
    const hx = 0.028;
    const hz = 0.0135;
    const rib = (x: number) => (Math.abs(x + 0.004) < 0.005 ? 0.0012 : 0);
    for (let i = 0; i <= 10; i++) pts.push([-hx + (2 * hx * i) / 10, -hz - rib(-hx + (2 * hx * i) / 10)]);
    pts.push([hx + 0.003, -hz + 0.004], [hx + 0.004, 0], [hx + 0.003, hz - 0.004]);
    for (let i = 10; i >= 0; i--) pts.push([-hx + (2 * hx * i) / 10, hz + rib(-hx + (2 * hx * i) / 10)]);
    pts.push([-hx - 0.001, hz - 0.003], [-hx - 0.001, -hz + 0.003]);
    return pts;
  };
  const A = 0.62 * (L / 0.21); // total bend angle of the magazine
  const R = L / A;
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * A;
    // centre line on a circular arc; sections perpendicular to it
    const cx = 0.168 + R * (1 - Math.cos(a));
    const cy = -0.03 - R * Math.sin(a);
    magSecs.push(outline().map(([x, z]) => [cx + x * Math.cos(a), cy + x * Math.sin(a), z] as [number, number, number]));
  }
  add('Carregador', s(p, 'mag') === 'polimero' ? 'polymer' : 'dark', B.loft(magSecs));
  const ax = 0.168 + R * (1 - Math.cos(A));
  const ay = -0.03 - R * Math.sin(A);
  add('Base do carregador', 'dark', place(top(B.roundedRect(0.064, 0.031, 0.004, 3, 0, 0), -0.003, 0.003, 0.0012), T.at(ax + 0.0025 * Math.sin(A), ay - 0.0025 * Math.cos(A), 0), T.rz(A)));
  return parts;
}
