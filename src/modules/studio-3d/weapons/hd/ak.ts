import type { Params, WeaponPart } from '../catalog';
import { alongX, B, grip, gripPanels, pinZ, place, sector, side, T, top, tubeX, turnX, type GripShape, type V2 } from './kit';

/**
 * AKM (the modernised AK-47, the "AK" of most games and films), built from its own reference data:
 *  - overall length 880 mm with the slant compensator, barrel 415 mm from the bolt face,
 *    sight radius 378 mm (Wikipedia / Small Arms Survey);
 *  - receiver stamped from 1.0 mm sheet, ~245 mm long, ~30 mm wide; front trunnion held by
 *    6 rivets (3 in a vertical line on each side, Soviet pattern), rear trunnion by 4 (2 per side),
 *    trigger guard by 5 rivets underneath; magazine-guide dimples above the magazine well;
 *  - three pins on the side (hammer, trigger and the AKM's hammer-release / rate-reducer);
 *  - ribbed stamped dust cover with the recoil-spring button at the rear;
 *  - tangent rear sight on its block just ahead of the receiver (leaf hinged at the front, notch at
 *    the rear), gas-tube latch on the right of the block;
 *  - 45° gas block with the relief ports, front sling loop and cleaning-rod tab;
 *  - front sight base near the muzzle with protective ears and the bayonet lug; slant compensator
 *    (longer at the bottom-left);
 *  - laminated handguards: lower one with finger swells and its retainer, upper one over the gas tube;
 *  - fixed laminated stock with steel butt plate (cleaning-kit trapdoor) and left sling swivel;
 *  - 30-round magazine 232 × 64 × 32 mm, stamped steel with side ribs.
 * Coordinates: metres, x = 0 at the rear of the receiver, +x to the muzzle, bore on y = 0.
 */
const n = (p: Params, k: string) => Number(p[k]);
const s = (p: Params, k: string) => String(p[k]);

const RX = 0.245; // receiver length
const HW = 0.0151; // receiver half width (30 mm)
const BOT = -0.034; // receiver bottom
const TOPR = 0.011; // top edge of the side walls (dust cover sits on it)
const BOLT = 0.208; // bolt face

/** Dome-headed rivet on a side face (axis Z). */
const rivet = (x: number, y: number, z: number, r = 0.0024, h = 0.0011) => {
  const sg = Math.sign(z) || 1;
  return place(B.lathe([[0, 0], [r, 0], [r * 0.92, h * 0.45], [r * 0.6, h * 0.85], [0, h]], 14), T.at(x, y, z), T.rx((sg * Math.PI) / 2));
};
/** Dome rivet on the bottom face (axis −Y). */
const rivetDown = (x: number, z: number, r = 0.0021) => place(B.lathe([[0, 0], [r, 0], [r * 0.6, 0.0008], [0, 0.001]], 12), T.at(x, BOT, z), T.rx(Math.PI));

export function buildAK(p: Params): WeaponPart[] {
  const parts: WeaponPart[] = [];
  const add = (name: string, slot: WeaponPart['slot'], mesh: WeaponPart['mesh'], shading: WeaponPart['shading'] = 'auto', subdiv = true, wear = true) => parts.push({ name, slot, mesh, shading, subdiv, wear });
  const barrel = n(p, 'barrel');
  const muzzle = BOLT + barrel;
  const wood = s(p, 'furniture') === 'madeira';
  const furn = wood ? 'wood' : 'polymer';

  // ------------------------------------------------------------------ receiver (stamped sheet)
  const recv: V2[] = [[0, -0.029], [0.005, BOT], [0.236, BOT], [0.243, -0.031], [RX, -0.026], [RX, TOPR], [0.004, TOPR], [0, 0.006]];
  // ejection port: upper half of the right wall, in front of the selector's reach
  const port = B.roundedRect(0.066, 0.011, 0.0016, 3, 0.163, 0.0042);
  add('Caixa da culatra (esq.)', 'dark', side(recv, -HW, 0, 0.0011));
  add('Caixa da culatra (dir.)', 'dark', side(recv, 0, HW, 0.0011, [port]));
  // magazine-guide dimples above the magazine well (AKM)
  const dimple = B.roundedRect(0.014, 0.007, 0.0034, 3, 0.214, -0.023);
  add('Covinhas do carregador', 'dark', B.merge(side(dimple, HW - 0.0004, HW + 0.0005, 0.0003, [], 1), side(dimple, -HW - 0.0005, -HW + 0.0004, 0.0003, [], 1)), 'auto', false);
  // rivets: front trunnion 3 in a vertical line per side, rear trunnion 2 per side, center support 1 per side
  const sideRivets: [number, number][] = [[0.229, -0.008], [0.229, -0.017], [0.229, -0.026], [0.011, -0.006], [0.011, -0.025], [0.122, -0.029]];
  add('Rebites', 'dark', B.merge(...sideRivets.flatMap(([x, y]) => [rivet(x, y, HW), rivet(x, y, -HW)]), ...[0.07, 0.083, 0.152, 0.163, 0.174].map((x) => rivetDown(x, 0))));
  // trigger group pins (heads on both sides): hammer, trigger, hammer release (AKM rate reducer)
  const pins: [number, number][] = [[0.147, -0.022], [0.118, -0.025], [0.133, -0.013]];
  add('Pinos do mecanismo', 'dark', B.merge(...pins.flatMap(([x, y]) => [pinZ(x, y, HW + 0.0003, 0.0024, 0.0007, 14), pinZ(x, y, -HW - 0.0003, 0.0024, 0.0007, 14)])));
  // side optics mount rail on the left wall (dovetail plate, 3 rivets)
  add('Trilho lateral (luneta)', 'dark', B.merge(
    side([[0.098, -0.0175], [0.205, -0.0175], [0.207, -0.0145], [0.207, 0.0], [0.205, 0.003], [0.098, 0.003], [0.096, 0.0], [0.096, -0.0145]], -HW - 0.0028, -HW + 0.0002, 0.0007),
    side([[0.104, -0.002], [0.198, -0.002], [0.198, 0.0018], [0.104, 0.0018]], -HW - 0.0042, -HW - 0.0026, 0.0004),
    ...[0.11, 0.152, 0.194].map((x) => rivet(x, -0.0105, -HW - 0.0028, 0.0021, 0.0009)),
  ));
  // dust cover: rounded, with the AKM's transverse stiffening ribs and the recoil-spring button at the rear
  const cover: V2[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    cover.push([Math.cos(a) * 0.0146, TOPR + Math.sin(a) * 0.0145]);
  }
  add('Tampa da caixa', 'dark', alongX(cover, 0.003, 0.236, 0.0008));
  const ribArc = cover.map(([z, y]) => [z * 1.014, TOPR + (y - TOPR) * 1.016] as V2);
  add('Nervuras da tampa', 'dark', B.merge(...[0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.205].map((x) => alongX(ribArc, x, x + 0.0045, 0.0005))));
  add('Botão da mola recuperadora', 'dark', B.merge(turnX([[0, -0.006], [0.0042, -0.006], [0.0042, 0.006], [0, 0.0062]], TOPR + 0.0105, 0, 16), side([[0.0, TOPR + 0.004], [0.006, TOPR + 0.004], [0.006, TOPR + 0.0145], [0.0, TOPR + 0.0145]], -0.0042, 0.0042, 0.0006)));
  // bolt carrier (seen through the port) + charging handle at the front of the port
  add('Porta-ferrolho', 'dark', B.merge(turnX([[0.0068, 0.13], [0.0068, BOLT - 0.004], [0, BOLT - 0.003]], 0.0035, 0, 20), side(B.roundedRect(0.07, 0.009, 0.002, 2, 0.165, 0.006), 0.002, 0.0132, 0.0006)));
  add('Ferrolho', 'bright', turnX([[0, BOLT - 0.032], [0.0052, BOLT - 0.032], [0.0055, BOLT - 0.004], [0, BOLT - 0.003]], 0, 0, 18));
  add('Alavanca de manejo', 'dark', B.merge(side([[0.19, 0.0], [0.203, 0.0], [0.203, 0.0095], [0.19, 0.0095]], HW - 0.001, HW + 0.012, 0.0014), place(B.lathe([[0, 0], [0.0052, 0.002], [0.006, 0.008], [0.0042, 0.0125], [0, 0.013]], 18), T.at(0.1965, 0.0048, HW + 0.012), T.rx(Math.PI / 2))));
  // safety/selector lever on the right: pivot at the rear, long blade covering the carrier slot, finger tab
  const lever: V2[] = [[0.036, 0.001], [0.152, 0.001], [0.162, -0.003], [0.163, -0.011], [0.152, -0.013], [0.143, -0.0075], [0.048, -0.0072], [0.034, -0.005]];
  add('Seletor de tiro', 'dark', B.merge(side(lever, HW + 0.0003, HW + 0.0019, 0.0006), pinZ(0.042, -0.003, HW + 0.0021, 0.0042, 0.0016, 16), side(B.roundedRect(0.006, 0.0025, 0.001, 2, 0.155, -0.0035), HW + 0.0018, HW + 0.0029, 0.0004, [], 1)));

  // ------------------------------------------------------------------ rear sight block + tangent leaf
  const rs0 = RX;
  const rs1 = RX + 0.062;
  add('Base da alça de mira', 'dark', B.merge(
    side([[rs0, -0.012], [rs1, -0.012], [rs1, 0.026], [rs1 - 0.012, 0.031], [rs0 + 0.008, 0.031], [rs0, 0.022]], -0.0118, 0.0118, 0.0016),
    // gas-tube latch on the right of the block
    side([[rs1 - 0.022, 0.013], [rs1 - 0.004, 0.013], [rs1 - 0.002, 0.019], [rs1 - 0.02, 0.019]], 0.0118, 0.0142, 0.0006),
    pinZ(rs1 - 0.019, 0.016, 0.0145, 0.003, 0.0012, 12),
  ));
  // leaf hinged at the front of the block; the notch end reaches back over the dust cover (sight radius 378 mm)
  const notchX = muzzle - 0.03 - 0.378;
  const leafY = 0.034;
  add('Alça de mira tangente', 'dark', B.merge(
    // U notch cut in the raised rear end of the leaf
    side([[notchX, leafY - 0.0025], [rs1 - 0.006, leafY - 0.0035], [rs1 - 0.006, leafY + 0.0005], [notchX + 0.008, leafY + 0.0035], [notchX + 0.003, leafY + 0.0045], [notchX + 0.0022, leafY + 0.0045], [notchX + 0.0016, leafY + 0.0022], [notchX + 0.001, leafY + 0.0045], [notchX, leafY + 0.0045]], -0.0072, 0.0072, 0.0004, [], 1),
    // range slider
    side(B.roundedRect(0.014, 0.0065, 0.0012, 2, notchX + 0.03, leafY), -0.0095, 0.0095, 0.0008),
    side(B.roundedRect(0.006, 0.0035, 0.001, 2, notchX + 0.03, leafY + 0.002), 0.0095, 0.0118, 0.0005, [], 1),
  ));

  // ------------------------------------------------------------------ barrel, gas system, front sight, muzzle
  add('Cano', 'dark', tubeX([[0.0039, BOLT], [0.0118, BOLT], [0.0118, rs0], [0.0086, rs0 + 0.004], [0.0086, muzzle - 0.06], [0.0079, muzzle - 0.055], [0.0079, muzzle], [0.0039, muzzle]], 0, 0, 28));
  const gb = Math.min(muzzle - 0.13, BOLT + 0.247); // gas block rear face
  const gy = 0.0205; // gas tube axis above the bore
  add('Tubo de gás', 'dark', B.merge(
    tubeX([[0.0088, rs1], [0.0108, rs1], [0.0108, gb - 0.002], [0.0088, gb - 0.002]], gy, 0, 20),
    // front ferrule of the upper handguard + rear latch tab
    tubeX([[0.0108, gb - 0.022], [0.0122, gb - 0.022], [0.0122, gb - 0.002], [0.0108, gb - 0.002]], gy, 0, 20),
  ));
  // gas block: the chamber block with the 45° face, radial relief ports, sling loop (left), rod tab (bottom)
  const gbFront = gb + 0.036;
  add('Bloco de gases', 'dark', B.merge(
    // collar clamped on the barrel
    tubeX([[0.0079, gb], [0.0122, gb], [0.0126, gb + 0.003], [0.0126, gb + 0.028], [0.0118, gb + 0.031], [0.0079, gb + 0.031]], 0, 0, 28),
    // gas chamber (cylinder in line with the tube), closed by the 45° front
    tubeX([[0, gb + 0.004], [0.0112, gb + 0.004], [0.0114, gb + 0.008], [0.0114, gbFront - 0.006], [0.0105, gbFront - 0.002], [0.007, gbFront], [0, gbFront]], gy, 0, 28),
    // the web joining collar and chamber, with the 45° leading edge
    side([[gb + 0.004, 0.004], [gb + 0.026, 0.004], [gb + 0.034, gy - 0.004], [gb + 0.004, gy - 0.004]], -0.0085, 0.0085, 0.0018),
    // cleaning-rod tab under the collar
    side([[gb + 0.008, -0.011], [gb + 0.026, -0.011], [gb + 0.024, -0.0215], [gb + 0.01, -0.0215]], -0.0045, 0.0045, 0.0008),
  ));
  add('Furos de alívio de gás', 'dark', B.merge(...[-1, 1].map((sg) => pinZ(gb + 0.03, gy + 0.002, sg * 0.0112, 0.0016, 0.0006, 10))), 'auto', false);
  add('Argola de bandoleira (frente)', 'dark', B.merge(
    side([[gb + 0.006, -0.002], [gb + 0.026, -0.002], [gb + 0.026, 0.002], [gb + 0.006, 0.002]], -0.0175, -0.0115, 0.0008),
    tubeX([[0.0105, gb + 0.004], [0.0125, gb + 0.004], [0.0125, gb + 0.028], [0.0105, gb + 0.028]], -0.0002, -0.024, 16),
  ), 'auto', false);
  // front sight base near the muzzle: block, open-top protective ears, post, bayonet lug
  const fs = muzzle - 0.03; // front sight post
  add('Massa de mira', 'dark', B.merge(
    // collar on the barrel
    tubeX([[0.0079, fs - 0.02], [0.0118, fs - 0.02], [0.0122, fs - 0.017], [0.0122, fs + 0.015], [0.0115, fs + 0.018], [0.0079, fs + 0.018]], 0, 0, 28),
    // sight tower rising from the collar (narrower than the collar), with the open-top protective ears
    side([[fs - 0.014, 0.006], [fs + 0.012, 0.006], [fs + 0.009, 0.0165], [fs - 0.01, 0.0165]], -0.0075, 0.0075, 0.0015),
    side([[fs - 0.007, 0.013], [fs + 0.008, 0.013], [fs + 0.008, 0.041], [fs + 0.002, 0.0435], [fs - 0.007, 0.036]], 0.0058, 0.0092, 0.0007),
    side([[fs - 0.007, 0.013], [fs + 0.008, 0.013], [fs + 0.008, 0.041], [fs + 0.002, 0.0435], [fs - 0.007, 0.036]], -0.0092, -0.0058, 0.0007),
    place(B.lathe([[0, 0], [0.0018, 0], [0.0018, 0.008], [0.0014, 0.026], [0, 0.0265]], 10), T.at(fs, 0.0135, 0)),
    // bayonet lug under the collar
    side([[fs - 0.004, -0.009], [fs + 0.03, -0.009], [fs + 0.03, -0.0175], [fs + 0.026, -0.0205], [fs - 0.002, -0.0205]], -0.0055, 0.0055, 0.0008),
    pinZ(fs - 0.012, 0.004, 0.0108, 0.0025, 0.0008, 12),
    pinZ(fs - 0.012, 0.004, -0.0108, 0.0025, 0.0008, 12),
  ));
  if (s(p, 'muzzle') === 'slant') {
    // AKM slant compensator: the cut leaves the lower-left side longer (pushes the muzzle down/right)
    add('Compensador inclinado', 'dark', B.merge(
      tubeX([[0.0042, muzzle - 0.004], [0.0102, muzzle - 0.004], [0.0102, muzzle + 0.022], [0.0042, muzzle + 0.022]], 0, 0, 24),
      alongX(sector(0.0058, 0.0102, -Math.PI / 2 - 1.5, -Math.PI / 2 + 1.2, 12), muzzle + 0.022, muzzle + 0.034, 0.0004),
    ));
  } else {
    add('Freio de boca', 'dark', B.merge(tubeX([[0.0045, muzzle - 0.002], [0.0125, muzzle - 0.002], [0.0125, muzzle + 0.008], [0.0045, muzzle + 0.008]], 0, 0, 6), ...[0, 1].map((i) => tubeX([[0.0055, muzzle + 0.016 + i * 0.016], [0.0125, muzzle + 0.016 + i * 0.016], [0.0125, muzzle + 0.024 + i * 0.016], [0.0055, muzzle + 0.024 + i * 0.016]], 0, 0, 6)), alongX([[-0.0125, 0.004], [0.0125, 0.004], [0.0125, 0.0108], [-0.0125, 0.0108]], muzzle + 0.008, muzzle + 0.05, 0.0006), alongX([[-0.0125, -0.0108], [0.0125, -0.0108], [0.0125, -0.004], [-0.0125, -0.004]], muzzle + 0.008, muzzle + 0.05, 0.0006)));
  }
  add('Vareta de limpeza', 'dark', turnX([[0, rs1 + 0.02], [0.003, rs1 + 0.02], [0.003, fs + 0.016], [0.0036, fs + 0.018], [0.0036, fs + 0.024], [0, fs + 0.025]], -0.0168, 0, 10));

  // ------------------------------------------------------------------ handguards (laminated wood or polymer)
  const lgEnd = gb - 0.014;
  const lower: V2[] = [];
  // lower handguard section: rounded bottom with the AKM finger swells flaring at mid height
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    const swell = 1 + 0.18 * Math.exp(-(((a - Math.PI * 1.15) / 0.22) ** 2)) + 0.18 * Math.exp(-(((a - Math.PI * 1.85) / 0.22) ** 2));
    lower.push([Math.cos(a) * 0.0205 * swell, -0.004 + Math.sin(a) * 0.0285]);
  }
  lower.push([0.0205, 0.0075], [-0.0205, 0.0075]);
  add('Guarda-mão inferior', furn, alongX(lower, RX + 0.002, lgEnd, 0.004, [], 2));
  // the AKM lower handguard's side ledges (finger rests)
  add('Ressaltos do guarda-mão', furn, B.merge(...[-1, 1].map((sz) => side(B.roundedRect(lgEnd - RX - 0.055, 0.0065, 0.003, 3, (RX + lgEnd) / 2 + 0.004, -0.003), sz > 0 ? 0.02 : -0.0228, sz > 0 ? 0.0228 : -0.02, 0.0012))), 'auto', false);
  add('Retém do guarda-mão', 'dark', B.merge(
    tubeX([[0.0212, lgEnd], [0.0232, lgEnd], [0.0232, lgEnd + 0.011], [0.0212, lgEnd + 0.011]], -0.004, 0, 24),
    // the retainer lever on the right
    side([[lgEnd + 0.001, -0.014], [lgEnd + 0.01, -0.014], [lgEnd + 0.01, 0.003], [lgEnd + 0.003, 0.004]], 0.0225, 0.0245, 0.0006),
  ));
  add('Anel traseiro do guarda-mão', 'dark', tubeX([[0.0206, RX - 0.002], [0.0222, RX - 0.002], [0.0222, RX + 0.006], [0.0206, RX + 0.006]], -0.004, 0, 24));
  const upper: V2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    upper.push([Math.cos(a) * 0.0162, gy + Math.sin(a) * 0.0138]);
  }
  upper.push([-0.0162, 0.0095], [0.0162, 0.0095]);
  add('Guarda-mão superior', furn, alongX(upper, rs1 + 0.004, gb - 0.022, 0.0035, [], 2));

  // ------------------------------------------------------------------ trigger group, pistol grip
  // long stamped trigger guard with the magazine release paddle at its front
  add('Guarda-mato', 'dark', side([[0.076, BOT], [0.166, BOT], [0.166, BOT - 0.005], [0.153, BOT - 0.019], [0.096, BOT - 0.021], [0.08, BOT - 0.011]], -0.0055, 0.0055, 0.0008, [[[0.086, BOT - 0.0025], [0.158, BOT - 0.0025], [0.147, BOT - 0.0155], [0.1, BOT - 0.0168], [0.088, BOT - 0.009]]]));
  add('Gatilho', 'dark', side([[0.122, BOT + 0.002], [0.126, BOT + 0.002], [0.126, BOT - 0.006], [0.123, BOT - 0.013], [0.117, BOT - 0.015], [0.121, BOT - 0.008]], -0.003, 0.003, 0.0006));
  add('Retém do carregador', 'dark', side([[0.166, BOT], [0.176, BOT], [0.177, BOT - 0.012], [0.171, BOT - 0.017], [0.166, BOT - 0.012]], -0.0062, 0.0062, 0.0008));
  // AKM grip: slim, raked, rounded section (lofted)
  const akGrip: GripShape = {
    front: [[0.0165, 0.006], [0.016, -0.02], [0.0166, -0.055], [0.0152, -0.085], [0.0095, -0.098]],
    back: [[-0.017, 0.006], [-0.0195, -0.02], [-0.021, -0.06], [-0.0198, -0.088], [-0.014, -0.098]],
    half: [[0.0132, 0.006], [0.0145, -0.02], [0.0152, -0.06], [0.0148, -0.098]],
    base: -0.098,
    round: 0.004,
    taperFront: 0.28,
    taperBack: () => 0.2,
    power: 3.4,
  };
  add('Empunhadura', wood ? 'wood' : 'polymer', place(grip(akGrip, 0.006), T.at(0.058, BOT, 0), T.rz(-0.32)), 'smooth');
  add('Quadriculado da empunhadura', wood ? 'wood' : 'polymer', place(gripPanels(akGrip, -0.022, -0.086, Math.PI / 2 + 0.08, 0.85, 0.0005), T.at(0.058, BOT, 0), T.rz(-0.32)), 'smooth', false);
  add('Parafuso da empunhadura', 'dark', place(B.lathe([[0, 0], [0.0045, 0], [0.0045, 0.0015], [0, 0.0018]], 14), T.at(0.058 - 0.098 * Math.sin(0.32) + 0.0, BOT - 0.098 * Math.cos(0.32) - 0.0005, 0), T.rz(-0.32), T.rx(Math.PI)));

  // ------------------------------------------------------------------ stock
  if (s(p, 'stock') === 'fixa') {
    // laminated, longer and straighter than the AK-47's; butt ~115 mm tall, ~230 mm behind the receiver
    const bx = -0.228;
    // Lofted, rounded laminated stock (not a flat slab): narrow wrist behind the receiver, comb line
    // dropping ~34 mm to the heel, straight toe line to a ~116 mm butt, oval-ish section 29 → 38 mm wide.
    // Built in the grip frame (local y = along the stock, local x = −height) and turned onto the bore axis.
    const stockShape: GripShape = {
      front: [[-BOT - 0.0005, 0.004], [0.04, -0.016], [0.058, -0.05], [0.084, -0.1], [0.108, -0.15], [0.124, -0.185], [0.1325, -0.205], [0.1465, bx]],
      back: [[-0.0055, 0.004], [-0.003, -0.02], [0.003, -0.06], [0.012, -0.11], [0.021, -0.16], [0.028, -0.2], [0.0305, bx]],
      half: [[0.0146, 0.004], [0.0152, -0.03], [0.0165, -0.08], [0.0178, -0.14], [0.0188, -0.2], [0.019, bx]],
      base: bx,
      round: 0.0025,
      taperFront: 0.22,
      taperBack: () => 0.3,
      power: 3.2,
    };
    add('Coronha', furn, place(grip(stockShape, 0.004, 28, 32), T.rz(-Math.PI / 2)), 'smooth');
    add('Chapa da soleira', 'dark', side([[bx + 0.0005, -0.1475], [bx - 0.005, -0.1475], [bx - 0.0065, -0.09], [bx - 0.005, -0.0295], [bx + 0.0005, -0.0295]], -0.0182, 0.0182, 0.0025, [], 2));
    add('Tampa do kit de limpeza', 'dark', side(B.roundedRect(0.002, 0.026, 0.0005, 2, bx - 0.0072, -0.082), -0.009, 0.009, 0.0003), 'auto', false);
    add('Parafuso da soleira', 'dark', B.merge(...[-0.04, -0.125].map((y) => place(B.lathe([[0, 0], [0.003, 0], [0.003, 0.001], [0, 0.0012]], 12), T.at(bx - 0.0065, y, 0), T.rz(Math.PI / 2)))));
    add('Argola de bandoleira (coronha)', 'dark', B.merge(
      side(B.roundedRect(0.016, 0.006, 0.0025, 3, bx + 0.035, -0.09), -0.0195, -0.0172, 0.0006),
      place(tubeX([[0.0055, -0.0015], [0.0075, -0.0015], [0.0075, 0.0015], [0.0055, 0.0015]], 0, 0, 16), T.at(bx + 0.035, -0.09, -0.024), T.rx(Math.PI / 2)),
    ));
    add('Parafuso da coronha', 'dark', pinZ(-0.012, -0.012, -HW - 0.0025, 0.0028, 0.001, 12));
  } else if (s(p, 'stock') === 'dobravel') {
    // AKMS under-folder: two stamped arms from the receiver to the butt plate
    const strut = (y0: number, y1: number) => side([[0, y0], [-0.02, y0], [-0.245, y1], [-0.245, y1 + 0.006], [-0.02, y0 + 0.006], [0, y0 + 0.006]], -0.0055, 0.0055, 0.0012);
    add('Coronha rebatível', 'dark', B.merge(place(strut(-0.006, -0.024), T.at(0, 0, 0.011)), place(strut(-0.006, -0.024), T.at(0, 0, -0.011)), side([[-0.245, -0.028], [-0.26, -0.032], [-0.265, -0.098], [-0.251, -0.1], [-0.237, -0.07], [-0.237, -0.03]], -0.016, 0.016, 0.003), side([[-0.03, -0.034], [-0.23, -0.088], [-0.237, -0.082], [-0.035, -0.028]], -0.0035, 0.0035, 0.0012)));
  }

  // ------------------------------------------------------------------ magazine: 30 rounds, 232 × 64 × 32 mm, ribbed stamped steel
  const magSecs: [number, number, number][][] = [];
  const L = n(p, 'magLen');
  const outline = (): V2[] => {
    const pts: V2[] = [];
    const hx = 0.03;
    const hz = 0.0148;
    // four long pressed ribs per side, following the curve (AKM "ribbed" steel magazine)
    const ribs = [-0.019, -0.0075, 0.004, 0.0155];
    const rib = (x: number) => (ribs.some((c) => Math.abs(x - c) < 0.0022) ? 0.0012 : 0);
    const k = 48;
    for (let i = 0; i <= k; i++) pts.push([-hx + (2 * hx * i) / k, -hz - rib(-hx + (2 * hx * i) / k)]);
    pts.push([hx + 0.002, -hz + 0.004], [hx + 0.0028, 0], [hx + 0.002, hz - 0.004]);
    for (let i = k; i >= 0; i--) pts.push([-hx + (2 * hx * i) / k, hz + rib(-hx + (2 * hx * i) / k)]);
    pts.push([-hx - 0.001, hz - 0.003], [-hx - 0.001, -hz + 0.003]);
    return pts;
  };
  const A = 0.6 * (L / 0.21); // total bend of the magazine
  const R = L / A;
  const m0 = 0.205; // magazine centre at the top (front lug hooks into the front trunnion)
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * A;
    const cx = m0 + R * (1 - Math.cos(a));
    const cy = BOT + 0.004 - R * Math.sin(a);
    magSecs.push(outline().map(([x, z]) => [cx + x * Math.cos(a), cy + x * Math.sin(a), z] as [number, number, number]));
  }
  add('Carregador', s(p, 'mag') === 'polimero' ? 'polymer' : 'dark', B.loft(magSecs), 'auto', true, false);
  const ax = m0 + R * (1 - Math.cos(A));
  const ay = BOT + 0.004 - R * Math.sin(A);
  add('Base do carregador', 'dark', B.merge(
    place(top(B.roundedRect(0.068, 0.033, 0.004, 3, 0, 0), -0.0028, 0.0028, 0.0011), T.at(ax + 0.0024 * Math.sin(A), ay - 0.0024 * Math.cos(A), 0), T.rz(A)),
    // retaining dimple of the floor plate
    place(B.lathe([[0, 0], [0.004, 0], [0.003, 0.0012], [0, 0.0014]], 12), T.at(ax + 0.005 * Math.sin(A) - 0.018 * Math.cos(A), ay - 0.005 * Math.cos(A) - 0.018 * Math.sin(A), 0), T.rz(A), T.rx(Math.PI)),
  ));
  return parts;
}
