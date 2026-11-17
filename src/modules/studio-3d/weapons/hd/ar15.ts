import type { Params, WeaponPart } from '../catalog';
import { alongX, B, picatinny, pinZ, place, sector, side, T, top, tubeX, turnX, type V2 } from './kit';

/**
 * AR-15 pattern carbine, high detail. Real-world proportions (M4-type, 14.5–20" barrels).
 * Upper/lower receivers are split left/right so the ejection port is a real opening
 * showing the bolt carrier; handguard side/bottom panels have through M-LOK slots.
 */

const n = (p: Params, k: string) => Number(p[k]);
const s = (p: Params, k: string) => String(p[k]);
const BORE_TO_DECK = 0.0205; // flat-top deck height above bore axis
const UP_BOTTOM = -0.0165; // upper/lower parting line
const HW = 0.01225; // receiver half width

export function buildAR15(p: Params): WeaponPart[] {
  const parts: WeaponPart[] = [];
  const add = (name: string, slot: WeaponPart['slot'], mesh: WeaponPart['mesh'], shading: WeaponPart['shading'] = 'auto') => parts.push({ name, slot, mesh, shading });

  const barrelLen = n(p, 'barrel'); // from bolt face (~x = 0.15)
  const muzzle = 0.15 + barrelLen;
  const hgEnd = Math.min(0.185 + n(p, 'handguard'), muzzle - 0.03);

  // ------------------------------------------------------------------ upper receiver
  const upperOutline: V2[] = [
    [0.0, UP_BOTTOM],
    [0.152, UP_BOTTOM],
    [0.156, -0.0235],
    [0.176, -0.0235],
    [0.18, UP_BOTTOM],
    [0.185, UP_BOTTOM],
    [0.185, BORE_TO_DECK],
    [0.006, BORE_TO_DECK],
    [0.0, 0.015],
  ];
  const port = B.roundedRect(0.064, 0.016, 0.0022, 3, 0.107, 0.0025);
  add('Receptor superior (esq.)', 'anodized', side(upperOutline, -HW, 0, 0.0012));
  add('Receptor superior (dir.)', 'anodized', side(upperOutline, 0, HW, 0.0012, [port]));
  add('Trilho do receptor', 'anodized', picatinny(0.006, 0.185, BORE_TO_DECK));
  // forward assist + brass deflector on the right side
  add('Forward assist', 'anodized', B.merge(turnX([[0.0072, 0.03], [0.0072, 0.07], [0.006, 0.074]], 0.0035, 0.0118, 24), turnX([[0, 0.016], [0.0058, 0.0165], [0.006, 0.02], [0.006, 0.03]], 0.0035, 0.0118, 24)));
  add('Defletor de cápsulas', 'anodized', top([[0.064, 0.0105], [0.08, 0.0105], [0.08, 0.019], [0.074, 0.019]], -0.003, 0.015, 0.0008));
  add('Tampa da janela (aberta)', 'anodized', B.merge(side(B.roundedRect(0.066, 0.0085, 0.0008, 2, 0.107, -0.0115), 0.0124, 0.0138, 0.0004, [], 1), side(B.roundedRect(0.05, 0.0012, 0.0004, 1, 0.107, -0.0115), 0.0136, 0.0142, 0.0002, [], 1)));
  add('Ferrolho (porta-ferrolho)', 'bright', B.merge(turnX([[0.0074, 0.02], [0.0074, 0.135], [0.0068, 0.14], [0.0045, 0.142], [0.0045, 0.152], [0, 0.152]], 0.0025, 0, 28), side(B.roundedRect(0.018, 0.0035, 0.0006, 2, 0.124, 0.0075), 0.0055, 0.0079, 0.0003, [], 1)));
  add('Alavanca de manejo', 'anodized', top([[0.01, -0.0055], [0.01, 0.0055], [-0.004, 0.0055], [-0.007, 0.0185], [-0.014, 0.0195], [-0.015, -0.0195], [-0.008, -0.0185], [-0.004, -0.0055]], 0.0115, 0.019, 0.0012));

  // ------------------------------------------------------------------ lower receiver
  const lowerOutline: V2[] = [
    [-0.012, UP_BOTTOM],
    [0.164, UP_BOTTOM],
    [0.168, -0.022],
    [0.164, -0.031],
    [0.14, -0.033],
    [0.136, -0.036],
    [0.135, -0.072],
    [0.131, -0.075],
    [0.067, -0.075],
    [0.063, -0.072],
    [0.062, -0.045],
    [0.056, -0.043],
    [0.012, -0.043],
    [0.002, -0.04],
    [-0.008, -0.04],
    [-0.014, -0.034],
    [-0.014, -0.02],
  ];
  add('Receptor inferior', 'anodized', side(lowerOutline, -HW, HW, 0.0013));
  add('Boca do carregador', 'anodized', side(B.roundedRect(0.074, 0.009, 0.0025, 3, 0.099, -0.0715), -0.0142, 0.0142, 0.0016));
  add('Guarda-mato', 'anodized', side([[0.012, -0.0425], [0.058, -0.0425], [0.058, -0.05], [0.05, -0.0595], [0.018, -0.0595], [0.012, -0.052]], -0.0045, 0.0045, 0.0007, [[[0.0175, -0.0455], [0.0535, -0.0455], [0.0475, -0.0545], [0.0215, -0.0545]]]));
  add('Gatilho', 'dark', side([[0.033, -0.04], [0.037, -0.04], [0.0375, -0.046], [0.0355, -0.0525], [0.031, -0.0545], [0.0325, -0.049], [0.033, -0.044]], -0.0028, 0.0028, 0.0006));
  add('Pinos', 'dark', B.merge(...[[0.158, -0.024], [-0.004, -0.026], [0.034, -0.033], [0.048, -0.03]].flatMap(([x, y]) => [pinZ(x, y, HW + 0.0004, 0.0029, 0.0012), pinZ(x, y, -HW - 0.0004, 0.0029, 0.0012)])));
  add('Seletor de tiro', 'dark', B.merge(pinZ(0.01, -0.03, -HW - 0.0006, 0.004, 0.0014), side([[0.008, -0.031], [0.02, -0.0335], [0.021, -0.0305], [0.009, -0.0285]], -HW - 0.0028, -HW - 0.0012, 0.0005)));
  add('Retém do ferrolho', 'dark', side([[0.058, -0.019], [0.066, -0.019], [0.068, -0.026], [0.062, -0.031], [0.057, -0.027]], -HW - 0.0016, -HW + 0.0002, 0.0005));
  add('Botão do carregador', 'dark', B.merge(pinZ(0.058, -0.038, HW + 0.0012, 0.0042, 0.0026), side(B.circle(0.0062, 20, 0.058, -0.038), HW - 0.0002, HW + 0.0006, 0.0003, [B.circle(0.0047, 20, 0.058, -0.038)], 1)));

  // ------------------------------------------------------------------ grip, buffer tube, stock
  const gripLocal: V2[] = [
    [0.016, 0],
    [0.0165, -0.018],
    [0.0195, -0.03],
    [0.0165, -0.04],
    [0.016, -0.07],
    [0.012, -0.084],
    [0.004, -0.088],
    [-0.01, -0.086],
    [-0.016, -0.076],
    [-0.017, -0.03],
    [-0.016, 0],
  ];
  add('Empunhadura', 'polymer', place(side(gripLocal, -0.0145, 0.0145, 0.0055, [], 3), T.at(0.006, -0.041, 0), T.rz(-0.36)));
  add('Tubo do amortecedor', 'dark', B.merge(turnX([[0, -0.192], [0.0136, -0.19], [0.0146, -0.186], [0.0146, -0.012], [0.0146, 0]], 0.0035, 0, 32), tubeX([[0.0146, -0.012], [0.018, -0.012], [0.018, -0.004], [0.0146, -0.004]], 0.0035, 0, 12)));
  add('Placa traseira', 'dark', side([[-0.0135, -0.013], [-0.0115, -0.013], [-0.0115, 0.02], [-0.0135, 0.02]], -0.014, 0.014, 0.0005));
  if (s(p, 'stock') !== 'nenhuma') {
    const pos = n(p, 'stockPos');
    const x0 = -0.095 - pos;
    const stockOutline: V2[] = [
      [x0, 0.016],
      [x0, -0.012],
      [x0 - 0.022, -0.017],
      [x0 - 0.11, -0.043],
      [x0 - 0.155, -0.058],
      [x0 - 0.17, -0.058],
      [x0 - 0.173, -0.05],
      [x0 - 0.173, 0.021],
      [x0 - 0.16, 0.024],
      [x0 - 0.035, 0.024],
    ];
    const cut: V2[] = [[x0 - 0.05, -0.006], [x0 - 0.135, -0.03], [x0 - 0.15, -0.035], [x0 - 0.152, 0.009], [x0 - 0.055, 0.01]];
    add('Coronha', 'polymer', side(stockOutline, -0.022, 0.022, 0.004, [cut], 3));
    add('Soleira de borracha', 'grip', side(B.roundedRect(0.008, 0.088, 0.003, 3, x0 - 0.178, -0.016), -0.0225, 0.0225, 0.0028, [], 2));
    add('Trava da coronha', 'polymer', side([[x0 - 0.01, -0.012], [x0 - 0.06, -0.022], [x0 - 0.062, -0.027], [x0 - 0.012, -0.018]], -0.005, 0.005, 0.0012));
  }

  // ------------------------------------------------------------------ handguard (free float M-LOK)
  const hx0 = 0.186;
  const len = hgEnd - hx0;
  const slots = Math.max(2, Math.floor((len - 0.04) / 0.04));
  const slotHoles = (cy: number): V2[][] => Array.from({ length: slots }, (_, i) => B.roundedRect(0.032, 0.0072, 0.0035, 4, hx0 + 0.03 + i * ((len - 0.06) / Math.max(1, slots - 1)), cy));
  const hgPanel: V2[] = B.roundedRect(len, 0.026, 0.001, 1, hx0 + len / 2, -0.004);
  add('Guarda-mão (lado dir.)', 'anodized', side(hgPanel, 0.0198, 0.0224, 0.0007, slotHoles(-0.004), 1));
  add('Guarda-mão (lado esq.)', 'anodized', side(hgPanel, -0.0224, -0.0198, 0.0007, slotHoles(-0.004), 1));
  add('Guarda-mão (inferior)', 'anodized', top(B.roundedRect(len, 0.026, 0.001, 1, hx0 + len / 2, 0), -0.0262, -0.0236, 0.0007, slotHoles(0), 1));
  add('Guarda-mão (topo)', 'anodized', alongX([[-0.0155, 0.0178], [0.0155, 0.0178], [0.0155, BORE_TO_DECK], [-0.0155, BORE_TO_DECK]], hx0, hgEnd, 0.0004));
  const chamfer = (sz: number, sy: number): V2[] => [[sz * 0.0155, sy > 0 ? 0.0178 : -0.0236], [sz * 0.0155, sy > 0 ? BORE_TO_DECK : -0.0262], [sz * 0.0224, sy > 0 ? 0.009 : -0.017], [sz * 0.0198, sy > 0 ? 0.009 : -0.017]];
  add('Guarda-mão (chanfros)', 'anodized', B.merge(...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => alongX(chamfer(a, b), hx0, hgEnd, 0.0003))));
  add('Trilho do guarda-mão', 'anodized', picatinny(hx0 + 0.001, hgEnd, BORE_TO_DECK));
  add('Porca do cano', 'dark', tubeX([[0.0105, 0.18], [0.0175, 0.18], [0.0175, 0.192], [0.0105, 0.192]], 0, 0, 24));

  // ------------------------------------------------------------------ barrel, gas block, muzzle device
  const bore = 0.0029;
  add('Cano', 'dark', tubeX([[bore, 0.17], [0.0098, 0.17], [0.0098, 0.24], [0.0088, 0.26], [0.0085, 0.33], [0.0078, 0.36], [0.0078, muzzle - 0.06], [0.0072, muzzle - 0.058], [0.0072, muzzle - 0.012], [0.0068, muzzle - 0.011], [0.0068, muzzle], [bore + 0.0006, muzzle + 0.0004], [bore, muzzle]], 0, 0, 32));
  add('Bloco de gases', 'dark', B.merge(side(B.roundedRect(0.024, 0.024, 0.003, 3, Math.min(0.355, hgEnd - 0.03), -0.0005), -0.0105, 0.0105, 0.0015), pinZ(Math.min(0.35, hgEnd - 0.035), 0.006, 0.0105, 0.0022, 0.0012), pinZ(Math.min(0.36, hgEnd - 0.025), 0.006, 0.0105, 0.0022, 0.0012)));
  const fh0 = muzzle - 0.012;
  if (s(p, 'muzzle') === 'a2') {
    add('Quebra-chamas A2', 'dark', B.merge(
      tubeX([[0.0045, fh0], [0.0105, fh0], [0.011, fh0 + 0.004], [0.011, fh0 + 0.012], [0.0045, fh0 + 0.012]], 0, 0, 28),
      tubeX([[0.0058, fh0 + 0.046], [0.0105, fh0 + 0.046], [0.0105, fh0 + 0.056], [0.0098, fh0 + 0.057], [0.0058, fh0 + 0.057]], 0, 0, 28),
      // tines between 5 slots on the top 2/3; the bottom stays closed (A2 compensating birdcage)
      ...[0, 1, 2, 3, 4].map((i) => {
        const a0 = -Math.PI / 2 + 0.55 + i * ((Math.PI * 2 - 1.1) / 5);
        return alongX(sector(0.0068, 0.0105, a0 + 0.2, a0 + ((Math.PI * 2 - 1.1) / 5), 5), fh0 + 0.012, fh0 + 0.046, 0.0003);
      }),
      alongX(sector(0.0068, 0.0105, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.75, 6), fh0 + 0.012, fh0 + 0.046, 0.0003),
    ));
  } else {
    add('Freio de boca', 'dark', B.merge(
      tubeX([[0.0045, fh0], [0.0125, fh0], [0.0125, fh0 + 0.008], [0.0045, fh0 + 0.008]], 0, 0, 6),
      ...[0, 1, 2].map((i) => tubeX([[0.0055, fh0 + 0.018 + i * 0.013], [0.0125, fh0 + 0.018 + i * 0.013], [0.0125, fh0 + 0.024 + i * 0.013], [0.0055, fh0 + 0.024 + i * 0.013]], 0, 0, 6)),
      alongX([[-0.0125, 0.004], [0.0125, 0.004], [0.0125, 0.0108], [-0.0125, 0.0108]], fh0 + 0.008, fh0 + 0.05, 0.0006),
      alongX([[-0.0125, -0.0108], [0.0125, -0.0108], [0.0125, -0.004], [-0.0125, -0.004]], fh0 + 0.008, fh0 + 0.05, 0.0006),
      tubeX([[0.0055, fh0 + 0.05], [0.0125, fh0 + 0.05], [0.0125, fh0 + 0.056], [0.0055, fh0 + 0.056]], 0, 0, 6),
    ));
  }

  // ------------------------------------------------------------------ magazine
  const steel = s(p, 'mag') !== 'polimero';
  const magSections: [number, number, number][][] = [];
  const magOutline = (w: number): V2[] => {
    // footprint in (x, z): 60 mm × 22.5 mm with stamped reinforcing ribs on the sides
    const pts: V2[] = [];
    const hx = 0.03;
    const hz = w / 2;
    const rib = (x: number) => (Math.abs(Math.abs(x) - 0.012) < 0.004 ? 0.0006 : 0);
    for (let i = 0; i <= 12; i++) pts.push([-hx + (2 * hx * i) / 12, -hz - rib(-hx + (2 * hx * i) / 12)]);
    pts.push([hx + 0.002, -hz + 0.002], [hx + 0.002, hz - 0.002]);
    for (let i = 12; i >= 0; i--) pts.push([-hx + (2 * hx * i) / 12, hz + rib(-hx + (2 * hx * i) / 12)]);
    pts.push([-hx - 0.0015, hz - 0.0025], [-hx - 0.0015, -hz + 0.0025]);
    return pts;
  };
  const magTop = -0.03;
  const magLen = n(p, 'magLen');
  const curve = 0.035 * (magLen / 0.17);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = magTop - t * magLen;
    const dx = curve * t ** 1.6;
    magSections.push(magOutline(0.0225).map(([x, z]) => [0.099 + x + dx, y, z] as [number, number, number]));
  }
  add('Carregador', steel ? 'anodized' : 'polymer', B.loft(magSections));
  const baseX = 0.099 + curve + 0.002;
  add('Base do carregador', steel ? 'dark' : 'polymer', place(top(B.roundedRect(0.07, 0.0265, 0.004, 3, 0, 0), -0.003, 0.003, 0.0012), T.at(baseX, magTop - magLen - 0.002, 0), T.rz(-0.22)));
  if (!steel) add('Janela do carregador', 'lens', side(B.roundedRect(0.006, 0.05, 0.003, 3, 0.07 + curve * 0.3, -0.105), -0.0116, 0.0116, 0.0004));

  // ------------------------------------------------------------------ optics / sights
  const optic = s(p, 'optic');
  const deck = BORE_TO_DECK + 0.0094;
  if (optic === 'holo') {
    const ox = 0.09;
    add('Mira holográfica (corpo)', 'anodized', B.merge(
      side(B.roundedRect(0.1, 0.012, 0.003, 3, ox, deck + 0.006), -0.017, 0.017, 0.002),
      alongX([[-0.02, deck + 0.011], [0.02, deck + 0.011], [0.02, deck + 0.043], [-0.02, deck + 0.043]], ox + 0.005, ox + 0.05, 0.0025, [[[-0.016, deck + 0.015], [0.016, deck + 0.015], [0.016, deck + 0.039], [-0.016, deck + 0.039]]], 2),
      alongX(B.roundedRect(0.014, 0.012, 0.003, 3, 0.011, deck + 0.018), ox - 0.045, ox, 0.0015),
      side(B.roundedRect(0.05, 0.004, 0.0015, 2, ox, deck - 0.001), -0.012, 0.012, 0.001),
    ));
    add('Mira holográfica (vidro)', 'lens', alongX([[-0.016, deck + 0.015], [0.016, deck + 0.015], [0.016, deck + 0.039], [-0.016, deck + 0.039]], ox + 0.044, ox + 0.046));
    add('Retículo', 'glow', alongX(B.circle(0.0012, 12, 0, deck + 0.027), ox + 0.043, ox + 0.0436));
  } else if (optic === 'reddot') {
    const ox = 0.08;
    add('Red dot (tubo)', 'anodized', B.merge(tubeX([[0.0148, ox - 0.035], [0.0172, ox - 0.035], [0.0172, ox + 0.035], [0.0148, ox + 0.035]], deck + 0.03, 0, 32), side(B.roundedRect(0.04, 0.014, 0.002, 2, ox, deck + 0.008), -0.009, 0.009, 0.0015), side(B.roundedRect(0.05, 0.004, 0.0015, 2, ox, deck), -0.012, 0.012, 0.001), turnX([[0, ox - 0.003], [0.006, ox - 0.003], [0.006, ox + 0.009], [0, ox + 0.009]], deck + 0.049, 0, 16)));
    add('Red dot (lente)', 'lens', turnX([[0, ox + 0.025], [0.0148, ox + 0.025], [0.0148, ox + 0.027], [0, ox + 0.027]], deck + 0.03, 0, 32));
    add('Retículo', 'glow', turnX([[0, ox + 0.0236], [0.0009, ox + 0.0236], [0.0009, ox + 0.024], [0, ox + 0.024]], deck + 0.03, 0, 12));
  } else if (optic === 'luneta') {
    const ox = 0.02;
    const h = deck + 0.035;
    add('Luneta (LPVO)', 'anodized', B.merge(
      tubeX([[0.0145, ox], [0.02, ox], [0.0205, ox + 0.012], [0.015, ox + 0.04], [0.015, ox + 0.17], [0.022, ox + 0.21], [0.0225, ox + 0.24], [0.0195, ox + 0.242], [0.0195, ox + 0.244]], h, 0, 40),
      place(B.lathe([[0, 0], [0.0095, 0], [0.0095, 0.016], [0, 0.017]], 24), T.at(ox + 0.1, h + 0.0145, 0)),
      place(B.lathe([[0, 0], [0.0095, 0], [0.0095, 0.016], [0, 0.017]], 24), T.at(ox + 0.1, h, 0.0145), T.rx(Math.PI / 2)),
      ...[ox + 0.065, ox + 0.15].map((x) => B.merge(tubeX([[0.015, x - 0.008], [0.0185, x - 0.008], [0.0185, x + 0.008], [0.015, x + 0.008]], h, 0, 32), side(B.roundedRect(0.016, h - deck - 0.012, 0.002, 2, x, (h + deck) / 2 - 0.006), -0.008, 0.008, 0.0012))),
      side(B.roundedRect(0.14, 0.006, 0.002, 2, ox + 0.105, deck), -0.0125, 0.0125, 0.0012),
    ));
    add('Luneta (lentes)', 'lens', B.merge(turnX([[0, ox + 0.004], [0.0145, ox + 0.004], [0.0145, ox + 0.006], [0, ox + 0.006]], h, 0, 32), turnX([[0, ox + 0.236], [0.0195, ox + 0.236], [0.0195, ox + 0.238], [0, ox + 0.238]], h, 0, 32)));
  }
  if (optic === 'iron' || optic === 'holo' || optic === 'reddot') {
    // flip-up back-up iron sights (folded when an optic is mounted)
    const up = optic === 'iron';
    const rear = up
      ? B.merge(side([[0.008, deck], [0.024, deck], [0.022, deck + 0.022], [0.01, deck + 0.022]], -0.009, 0.009, 0.0012, [B.circle(0.0014, 12, 0.016, deck + 0.016)]), side(B.roundedRect(0.02, 0.005, 0.0015, 2, 0.016, deck + 0.0025), -0.011, 0.011, 0.001))
      : side(B.roundedRect(0.024, 0.008, 0.0015, 2, 0.016, deck + 0.004), -0.011, 0.011, 0.0012);
    add('Alça de mira (rebatível)', 'anodized', rear);
    const fx = hgEnd - 0.016;
    const front = up
      ? B.merge(side([[fx - 0.008, deck], [fx + 0.008, deck], [fx + 0.004, deck + 0.026], [fx - 0.004, deck + 0.026]], -0.009, 0.009, 0.0012, [B.roundedRect(0.005, 0.012, 0.002, 2, fx, deck + 0.017)]), side(B.roundedRect(0.0016, 0.012, 0.0006, 1, fx, deck + 0.018), -0.0009, 0.0009, 0.0003, [], 1), side(B.roundedRect(0.02, 0.005, 0.0015, 2, fx, deck + 0.0025), -0.011, 0.011, 0.001))
      : side(B.roundedRect(0.024, 0.008, 0.0015, 2, fx, deck + 0.004), -0.011, 0.011, 0.0012);
    add('Massa de mira (rebatível)', 'anodized', front);
  }
  return parts;
}
