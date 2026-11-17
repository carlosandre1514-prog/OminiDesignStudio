import type { Params, WeaponPart } from '../catalog';
import { alongX, B, grip, gripPanels, picatinny, pinZ, place, sector, side, superSector, T, top, tubeX, turnX, type GripShape, type V2 } from './kit';

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
  const add = (name: string, slot: WeaponPart['slot'], mesh: WeaponPart['mesh'], shading: WeaponPart['shading'] = 'auto', subdiv = true) => parts.push({ name, slot, mesh, shading, subdiv });

  const barrelLen = n(p, 'barrel'); // from bolt face (~x = 0.15)
  const muzzle = 0.15 + barrelLen;
  const hgEnd = Math.min(0.185 + n(p, 'hgLen'), muzzle - 0.03);

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
  // integrated, oversized trigger guard (rounded, room for gloves)
  add('Guarda-mato', 'anodized', side([[0.014, -0.0425], [0.061, -0.0425], [0.061, -0.05], [0.054, -0.0625], [0.038, -0.0665], [0.024, -0.064], [0.016, -0.056]], -0.0048, 0.0048, 0.0008, [[[0.0195, -0.0458], [0.0565, -0.0458], [0.0505, -0.0585], [0.0375, -0.0622], [0.0255, -0.0598], [0.0205, -0.0535]]]));
  add('Gatilho', 'dark', side([[0.033, -0.04], [0.037, -0.04], [0.0375, -0.046], [0.0355, -0.0525], [0.031, -0.0545], [0.0325, -0.049], [0.033, -0.044]], -0.0028, 0.0028, 0.0006));
  add('Pinos', 'dark', B.merge(...[[0.158, -0.024], [-0.004, -0.026], [0.034, -0.033], [0.048, -0.03]].flatMap(([x, y]) => [pinZ(x, y, HW + 0.0004, 0.0029, 0.0012), pinZ(x, y, -HW - 0.0004, 0.0029, 0.0012)])));
  add('Seletor de tiro', 'dark', B.merge(pinZ(0.01, -0.03, -HW - 0.0006, 0.004, 0.0014), side([[0.008, -0.031], [0.02, -0.0335], [0.021, -0.0305], [0.009, -0.0285]], -HW - 0.0028, -HW - 0.0012, 0.0005)));
  add('Retém do ferrolho', 'dark', side([[0.058, -0.019], [0.066, -0.019], [0.068, -0.026], [0.062, -0.031], [0.057, -0.027]], -HW - 0.0016, -HW + 0.0002, 0.0005));
  add('Botão do carregador', 'dark', B.merge(pinZ(0.058, -0.038, HW + 0.0012, 0.0042, 0.0026), side(B.circle(0.0062, 20, 0.058, -0.038), HW - 0.0002, HW + 0.0006, 0.0003, [B.circle(0.0047, 20, 0.058, -0.038)], 1)));

  // ------------------------------------------------------------------ grip, buffer tube, stock
  // Pistol grips are lofted from rounded cross-sections (not flat extrusions), in a frame raked back
  // from the receiver: x forward, y up along the grip. Real sizes: ~100 mm long, ~29 mm wide, ~40 mm deep.
  if (s(p, 'grip') === 'ergo') {
    // modern ergonomic grip (BCM/MOE-type): steeper rake, straight front strap, beavertail over the
    // web of the hand, palm swell, flat base; textured side panels
    const ergo: GripShape = {
      front: [[0.0172, 0.006], [0.017, -0.012], [0.0166, -0.035], [0.0162, -0.06], [0.0158, -0.084], [0.0148, -0.102]],
      back: [[-0.0305, 0.006], [-0.031, 0.0], [-0.0285, -0.0065], [-0.0238, -0.0135], [-0.0214, -0.024], [-0.022, -0.045], [-0.0226, -0.066], [-0.0208, -0.088], [-0.0188, -0.102]],
      half: [[0.0108, 0.006], [0.0116, -0.008], [0.0134, -0.028], [0.0144, -0.055], [0.0146, -0.082], [0.014, -0.102]],
      base: -0.102,
      round: 0.0045,
      taperFront: 0.32,
      taperBack: (y) => 0.12 + 0.36 * Math.min(1, Math.max(0, (y + 0.02) / 0.016)),
    };
    const T0 = [T.at(0.006, -0.0405, 0), T.rz(-0.3)];
    add('Empunhadura ergonômica', 'polymer', place(grip(ergo, 0.006), ...T0), 'smooth');
    add('Textura da empunhadura', 'grip', place(gripPanels(ergo, -0.02, -0.09, Math.PI / 2 + 0.12, 0.95), ...T0), 'smooth', false);
  } else {
    // A2-type: finger nub on the front strap, rounded back, raked ~23°
    const a2: GripShape = {
      front: [[0.017, 0.006], [0.017, -0.004], [0.0158, -0.02], [0.0206, -0.034], [0.0165, -0.047], [0.0158, -0.078], [0.0136, -0.094], [0.0105, -0.102]],
      back: [[-0.0135, 0.006], [-0.0145, -0.004], [-0.0192, -0.014], [-0.0195, -0.05], [-0.0178, -0.085], [-0.0135, -0.102]],
      half: [[0.0112, 0.006], [0.0124, -0.01], [0.0137, -0.03], [0.0138, -0.09], [0.0132, -0.102]],
      base: -0.102,
      round: 0.004,
      taperFront: 0.38,
    };
    add('Empunhadura', 'polymer', place(grip(a2, 0.006), T.at(0.006, -0.0405, 0), T.rz(-0.4)), 'smooth');
  }
  add('Tubo do amortecedor', 'dark', B.merge(turnX([[0, -0.192], [0.0136, -0.19], [0.0146, -0.186], [0.0146, -0.012], [0.0146, 0]], 0.0035, 0, 32), tubeX([[0.0146, -0.012], [0.018, -0.012], [0.018, -0.004], [0.0146, -0.004]], 0.0035, 0, 12)));
  add('Placa traseira', 'dark', side([[-0.0135, -0.013], [-0.0115, -0.013], [-0.0115, 0.02], [-0.0135, 0.02]], -0.014, 0.014, 0.0005));
  const stockKind = s(p, 'stock');
  if (stockKind === 'bcm') {
    // BCM Gunfighter-type stock (as on the Springfield Saint): boxy sleeve around the buffer tube,
    // vertical step down to a flat-bottomed body, triangular toe with sling slot + QD socket,
    // recessed side panels and a rubber butt pad. Side profile measured from the reference photo.
    const pos = n(p, 'stockPos');
    const xf = -0.055 - pos;
    const L = 0.165;
    const X = (u: number) => xf - u;
    const top = 0.0195;
    // short sleeve, then the lower body starts ~3.5 cm behind the front and runs to the toe
    const profile: V2[] = [
      [X(0), top - 0.004],
      [X(0.002), -0.0165],
      [X(0.006), -0.0205],
      [X(0.026), -0.0205],
      [X(0.032), -0.025],
      [X(0.037), -0.055],
      [X(0.043), -0.06],
      [X(0.118), -0.066],
      [X(L - 0.006), -0.106],
      [X(L), -0.107],
      [X(L), top - 0.002],
      [X(L - 0.006), top],
      [X(0.006), top],
    ];
    // sling slot in the triangular toe, parallel to its slanted bottom
    const ang = Math.atan2(-0.04, -0.041);
    const sc = [X(0.145), -0.08];
    const slot = B.roundedRect(0.022, 0.0062, 0.0022, 3, 0, 0).map(([x, y]) => [sc[0] + x * Math.cos(ang) - y * Math.sin(ang), sc[1] + x * Math.sin(ang) + y * Math.cos(ang)] as V2);
    // recessed side panel: the frame keeps the outline, the core sits 2.5 mm deeper
    const pocket: V2[] = [[X(0.045), -0.01], [X(0.048), -0.05], [X(0.118), -0.057], [X(0.135), -0.063], [X(0.135), -0.004], [X(0.129), -0.001], [X(0.052), -0.001]];
    add('Coronha', 'polymer', side(profile, -0.0175, 0.0175, 0.004, [pocket, slot], 3));
    add('Painel lateral da coronha', 'polymer', side(pocket, -0.015, 0.015, 0.0015, [], 2));
    // sling socket ring (QD) on both sides above the slot
    add('Soquete QD', 'dark', B.merge(...[1, -1].map((sg) => side(B.circle(0.0062, 20, X(0.15), -0.068), sg > 0 ? 0.0172 : -0.0186, sg > 0 ? 0.0186 : -0.0172, 0.0005, [B.circle(0.0034, 16, X(0.15), -0.068)], 1))));
    add('Soleira de borracha', 'grip', side([[X(L) + 0.0005, top - 0.001], [X(L) - 0.009, top - 0.003], [X(L) - 0.0095, -0.104], [X(L) - 0.006, -0.108], [X(L) + 0.0005, -0.1075]], -0.0195, 0.0195, 0.003, [], 2));
    // adjustment lever under the sleeve
    add('Trava da coronha', 'polymer', side([[X(0.004), -0.0198], [X(0.026), -0.0198], [X(0.03), -0.0255], [X(0.008), -0.0245]], -0.006, 0.006, 0.0012));
  } else if (stockKind !== 'nenhuma') {
    // M4-type collapsible stock riding on the buffer tube (top flush with the tube, angled underside)
    const pos = n(p, 'stockPos');
    const xf = -0.07 - pos;
    const xb = xf - 0.168;
    const stockOutline: V2[] = [
      [xf, 0.0195],
      [xf - 0.003, -0.004],
      [xf - 0.016, -0.0125],
      [xb + 0.03, -0.062],
      [xb + 0.008, -0.074],
      [xb, -0.075],
      [xb, 0.0215],
      [xb + 0.01, 0.0245],
      [xf - 0.025, 0.0245],
    ];
    const cut: V2[] = [[xf - 0.035, -0.012], [xb + 0.045, -0.05], [xb + 0.045, -0.022], [xf - 0.04, -0.006]];
    const sling = B.roundedRect(0.022, 0.006, 0.003, 3, xb + 0.02, -0.05);
    add('Coronha', 'polymer', side(stockOutline, -0.0185, 0.0185, 0.0035, [cut, sling], 3));
    add('Soleira de borracha', 'grip', side(B.roundedRect(0.009, 0.1, 0.004, 3, xb - 0.0045, -0.0265), -0.0205, 0.0205, 0.0035, [], 2));
    add('Trava da coronha', 'polymer', side([[xf - 0.006, -0.009], [xf - 0.05, -0.016], [xf - 0.052, -0.021], [xf - 0.008, -0.0145]], -0.005, 0.005, 0.0012));
  }

  const moe = s(p, 'handguard') === 'moe';
  // carbine with a fixed A2 front sight base at the mid-length gas position
  const fsbX = Math.min(0.15 + 0.255, muzzle - 0.085);
  if (moe) {
    // ---------------------------------------------------------------- polymer M-LOK handguard (MOE-type)
    const x0 = 0.198;
    const x1 = fsbX - 0.026;
    const A = 0.0235; // half width
    const Bh = 0.0255; // half height
    const W = 0.0032; // wall
    const N = 3.3; // superellipse exponent: rounded square
    const cy = -0.0025;
    const winR: [number, number] = [0.36, 0.82]; // right slot row (upper side)
    const winL: [number, number] = [Math.PI - 0.82, Math.PI - 0.36];
    const ring = (xa: number, xb: number, slot: boolean) => {
      const pieces = [
        // no bevel: segments butt together seamlessly; only the slot openings show edges
        alongX(superSector(A, Bh, W, N, winR[1], winL[0], cy), xa, xb, 0),
        alongX(superSector(A, Bh, W, N, winL[1], Math.PI * 2 + winR[0], cy), xa, xb, 0),
      ];
      if (!slot) pieces.push(alongX(superSector(A, Bh, W, N, winR[0], winR[1], cy, 6), xa, xb, 0), alongX(superSector(A, Bh, W, N, winL[0], winL[1], cy, 6), xa, xb, 0));
      return pieces;
    };
    const len = x1 - x0;
    const k = Math.max(2, Math.floor((len - 0.05) / 0.038));
    const slotLen = 0.026;
    const pitch = (len - 0.05) / k;
    const pieces: ReturnType<typeof alongX>[] = [];
    let x = x0;
    for (let i = 0; i < k; i++) {
      const sx = x0 + 0.03 + i * pitch;
      pieces.push(...ring(x, sx, false), ...ring(sx, sx + slotLen, true));
      x = sx + slotLen;
    }
    pieces.push(...ring(x, x1, false));
    add('Guarda-mão de polímero (M-LOK)', 'polymer', B.merge(...pieces), 'auto', false);
    // stippled grip panels on the lower sides
    add('Textura do guarda-mão', 'grip', B.merge(
      alongX(superSector(A + 0.0006, Bh + 0.0006, 0.0009, N, -0.85, -0.12, cy), x0 + 0.05, x1 - 0.02, 0.0003),
      alongX(superSector(A + 0.0006, Bh + 0.0006, 0.0009, N, Math.PI + 0.12, Math.PI + 0.85, cy), x0 + 0.05, x1 - 0.02, 0.0003),
    ), 'auto', false);
    add('Anel do guarda-mão', 'dark', B.merge(
      tubeX([[0.0105, 0.184], [0.0285, 0.184], [0.0292, 0.188], [0.0292, 0.194], [0.0275, x0 + 0.001], [0.0105, x0 + 0.001]], cy, 0, 40),
      tubeX([[0.0102, x1 - 0.001], [0.0238, x1 - 0.001], [0.0238, x1 + 0.007], [0.0102, x1 + 0.009]], cy * 0.5, 0, 36),
    ));
    // ---------------------------------------------------------------- A2 front sight base
    const fx = fsbX;
    const wing: V2[] = [[fx - 0.017, 0.0105], [fx + 0.015, 0.0105], [fx + 0.0045, 0.057], [fx - 0.0045, 0.057]];
    const win: V2[] = [[fx - 0.008, 0.0185], [fx + 0.0065, 0.0185], [fx + 0.0018, 0.0455], [fx - 0.0018, 0.0455]];
    add('Massa de mira A2', 'dark', B.merge(
      tubeX([[0.0076, fx - 0.017], [0.0132, fx - 0.017], [0.0132, fx + 0.015], [0.0076, fx + 0.015]], 0, 0, 32),
      side(wing, 0.0058, 0.0099, 0.0008, [win]),
      side(wing, -0.0099, -0.0058, 0.0008, [win]),
      side([[fx - 0.016, 0.0105], [fx + 0.014, 0.0105], [fx + 0.009, 0.019], [fx - 0.011, 0.019]], -0.0099, 0.0099, 0.0012),
      side([[fx - 0.0045, 0.054], [fx + 0.0045, 0.054], [fx + 0.004, 0.058], [fx - 0.004, 0.058]], -0.0099, 0.0099, 0.0006),
      place(B.lathe([[0, 0], [0.0017, 0], [0.0017, 0.024], [0.0011, 0.03], [0, 0.0302]], 12), T.at(fx, 0.018, 0)),
      side([[fx - 0.012, -0.007], [fx + 0.012, -0.007], [fx + 0.01, -0.021], [fx - 0.007, -0.022]], -0.0055, 0.0055, 0.0012),
      side([[fx + 0.006, -0.0145], [fx + 0.032, -0.0145], [fx + 0.032, -0.0205], [fx + 0.006, -0.0215]], -0.0035, 0.0035, 0.0008),
      B.tube(Array.from({ length: 13 }, (_, i) => {
        const t = -0.2 + (i / 12) * (Math.PI + 0.4);
        return [fx - 0.002 + Math.cos(t) * 0.0085, -0.023 - Math.sin(t) * 0.009, 0] as [number, number, number];
      }), () => 0.0013, 10),
      pinZ(fx - 0.008, 0.0, 0.0133, 0.0018, 0.0012),
      pinZ(fx + 0.007, 0.0, 0.0133, 0.0018, 0.0012),
    ));
  } else {
    // ---------------------------------------------------------------- free-float aluminium M-LOK handguard with top rail
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
    add('Guarda-mão (chanfros)', 'anodized', B.merge(...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a2, b2]) => alongX(chamfer(a2, b2), hx0, hgEnd, 0.0003))));
    add('Trilho do guarda-mão', 'anodized', picatinny(hx0 + 0.001, hgEnd, BORE_TO_DECK));
    add('Porca do cano', 'dark', tubeX([[0.0105, 0.18], [0.0175, 0.18], [0.0175, 0.192], [0.0105, 0.192]], 0, 0, 24));
  }

  // ------------------------------------------------------------------ barrel, gas block, muzzle device
  const bore = 0.0029;
  add('Cano', 'dark', tubeX([[bore, 0.17], [0.0098, 0.17], [0.0098, 0.24], [0.0088, 0.26], [0.0085, 0.33], [0.0078, 0.36], [0.0078, muzzle - 0.06], [0.0072, muzzle - 0.058], [0.0072, muzzle - 0.012], [0.0068, muzzle - 0.011], [0.0068, muzzle], [bore + 0.0006, muzzle + 0.0004], [bore, muzzle]], 0, 0, 32));
  if (!moe) add('Bloco de gases', 'dark', B.merge(side(B.roundedRect(0.024, 0.024, 0.003, 3, Math.min(0.355, hgEnd - 0.03), -0.0005), -0.0105, 0.0105, 0.0015), pinZ(Math.min(0.35, hgEnd - 0.035), 0.006, 0.0105, 0.0022, 0.0012), pinZ(Math.min(0.36, hgEnd - 0.025), 0.006, 0.0105, 0.0022, 0.0012)));
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
  const curve = (steel ? 0.05 : 0.034) * (magLen / 0.17);
  // last section ~1.5 mm above the bottom: a support loop so subdivision keeps the base square to the floor plate
  for (const t of [...Array.from({ length: 10 }, (_, i) => i / 10), 1 - 0.0015 / magLen, 1]) {
    const y = magTop - t * magLen;
    const dx = curve * t ** 1.6;
    magSections.push(magOutline(0.0225).map(([x, z]) => [0.099 + x + dx, y, z] as [number, number, number]));
  }
  add('Carregador', steel ? 'anodized' : 'polymer', B.loft(magSections));
  const baseX = 0.099 + curve + 0.002;
  add('Base do carregador', steel ? 'dark' : 'polymer', place(top(B.roundedRect(0.066, 0.0262, 0.004, 3, 0, 0), -0.0032, 0.0032, 0.0012), T.at(baseX + 0.001, magTop - magLen - 0.0018, 0), T.rz(-0.04)));
  if (!steel) {
    // PMAG M2-type: large raised rectangular panels (2 columns × 3 rows) on both sides
    const bumps = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) {
        const t = 0.3 + r * 0.2;
        const y = magTop - t * magLen;
        const xx = 0.099 - 0.0105 + c * 0.021 + curve * t ** 1.6;
        for (const z of [0.01125, -0.01125 - 0.0008]) bumps.push(side(B.roundedRect(0.0175, 0.028 * (magLen / 0.165), 0.0022, 3, xx, y), z, z + 0.0008, 0.0003, [], 1));
      }
    add('Textura do carregador', 'polymer', B.merge(...bumps));
  }

  // ------------------------------------------------------------------ optics / sights
  const optic = s(p, 'optic');
  const deck = BORE_TO_DECK + 0.0094;
  /** Holographic sight (EOTech-type): base, rear electronics body, rounded hood with real window, battery cap, reticle. */
  const holo = (ox: number) => {
    const ay = deck + 0.028; // optical axis
    add('Mira holográfica (corpo)', 'anodized', B.merge(
      side(B.roundedRect(0.1, 0.012, 0.003, 3, ox, deck + 0.006), -0.017, 0.017, 0.002),
      alongX(B.roundedRect(0.042, 0.035, 0.007, 4, 0, ay), ox - 0.005, ox + 0.05, 0.0025, [B.roundedRect(0.034, 0.026, 0.004, 4, 0, ay)], 2),
      alongX(B.roundedRect(0.03, 0.018, 0.005, 4, 0, deck + 0.02), ox - 0.048, ox - 0.004, 0.002, [], 2),
      place(B.lathe([[0, 0], [0.0075, 0], [0.0078, 0.002], [0.0078, 0.006], [0.007, 0.0072], [0, 0.0074]], 28), T.at(ox + 0.03, deck + 0.012, -0.017), T.rx(-Math.PI / 2)),
      ...[0, 1, 2].map((i) => place(B.lathe([[0, 0], [0.0028, 0], [0.0028, 0.0022], [0, 0.0024]], 14), T.at(ox - 0.048, deck + 0.016 + i * 0.0001, -0.008 + i * 0.008), T.rz(Math.PI / 2))),
      side(B.roundedRect(0.05, 0.004, 0.0015, 2, ox, deck - 0.001), -0.012, 0.012, 0.001),
      pinZ(ox + 0.02, deck + 0.004, 0.0175, 0.0035, 0.002),
    ));
    add('Mira holográfica (vidro)', 'lens', alongX(B.roundedRect(0.034, 0.026, 0.004, 4, 0, ay), ox + 0.043, ox + 0.045));
    add('Retículo', 'glow', alongX(B.circle(0.0011, 12, 0, ay), ox + 0.0424, ox + 0.0428));
  };
  /** 3× magnifier on a flip-to-side mount, aligned with the holographic sight's axis. */
  const magnifier = (x0: number) => {
    const ay = deck + 0.028;
    add('Lupa 3× (corpo)', 'anodized', B.merge(
      tubeX([[0.0135, x0], [0.018, x0], [0.0182, x0 + 0.004], [0.0182, x0 + 0.03], [0.016, x0 + 0.038], [0.016, x0 + 0.09], [0.0172, x0 + 0.096], [0.0172, x0 + 0.105], [0.0135, x0 + 0.105]], ay, 0, 40),
      tubeX([[0.016, x0 + 0.05], [0.0172, x0 + 0.05], [0.0172, x0 + 0.074], [0.016, x0 + 0.074]], ay, 0, 40),
      side(B.roundedRect(0.042, 0.012, 0.003, 3, x0 + 0.062, deck + 0.006), -0.0145, 0.0145, 0.002),
      side([[x0 + 0.044, deck + 0.012], [x0 + 0.08, deck + 0.012], [x0 + 0.076, ay - 0.012], [x0 + 0.048, ay - 0.012]], 0.006, 0.0165, 0.0015),
      place(B.lathe([[0, 0], [0.0042, 0], [0.0042, 0.03], [0, 0.0302]], 18), T.at(x0 + 0.044, deck + 0.016, 0.0165), T.rz(-Math.PI / 2)),
      place(B.lathe([[0, 0], [0.0055, 0], [0.006, 0.003], [0.006, 0.006], [0, 0.0065]], 20), T.at(x0 + 0.062, ay - 0.014, 0.017), T.rx(Math.PI / 2)),
    ));
    add('Lupa 3× (lentes)', 'lens', B.merge(turnX([[0, x0 + 0.003], [0.0135, x0 + 0.003], [0.0135, x0 + 0.005], [0, x0 + 0.005]], ay, 0, 32), turnX([[0, x0 + 0.1], [0.0135, x0 + 0.1], [0.0135, x0 + 0.102], [0, x0 + 0.102]], ay, 0, 32)));
  };
  if (optic === 'holo') {
    holo(0.09);
  } else if (optic === 'combo') {
    holo(0.13);
    magnifier(-0.032);
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
  if (optic === 'iron' || optic === 'holo' || optic === 'reddot' || optic === 'combo') {
    // flip-up back-up iron sights (folded when an optic is mounted)
    const up = optic === 'iron';
    const rear = up
      ? B.merge(side([[0.008, deck], [0.024, deck], [0.022, deck + 0.022], [0.01, deck + 0.022]], -0.009, 0.009, 0.0012, [B.circle(0.0014, 12, 0.016, deck + 0.016)]), side(B.roundedRect(0.02, 0.005, 0.0015, 2, 0.016, deck + 0.0025), -0.011, 0.011, 0.001))
      : side(B.roundedRect(0.024, 0.008, 0.0015, 2, 0.016, deck + 0.004), -0.011, 0.011, 0.0012);
    if (optic !== 'combo') add('Alça de mira (rebatível)', 'anodized', rear);
    const fx = hgEnd - 0.016;
    const front = up
      ? B.merge(side([[fx - 0.008, deck], [fx + 0.008, deck], [fx + 0.004, deck + 0.026], [fx - 0.004, deck + 0.026]], -0.009, 0.009, 0.0012, [B.roundedRect(0.005, 0.012, 0.002, 2, fx, deck + 0.017)]), side(B.roundedRect(0.0016, 0.012, 0.0006, 1, fx, deck + 0.018), -0.0009, 0.0009, 0.0003, [], 1), side(B.roundedRect(0.02, 0.005, 0.0015, 2, fx, deck + 0.0025), -0.011, 0.011, 0.001))
      : side(B.roundedRect(0.024, 0.008, 0.0015, 2, fx, deck + 0.004), -0.011, 0.011, 0.0012);
    if (!moe) add('Massa de mira (rebatível)', 'anodized', front);
  }
  return parts;
}
