import type { Params, WeaponPart } from '../catalog';
import { alongX, B, picatinny, pinZ, place, side, T, tubeX, turnX, type V2 } from './kit';

/** High-detail long guns: bolt-action sniper (M24-type), pump shotgun (870-type), 9 mm SMG (MP5-type). */
const n = (p: Params, k: string) => Number(p[k]);
const s = (p: Params, k: string) => String(p[k]);
type Add = (name: string, slot: WeaponPart['slot'], mesh: WeaponPart['mesh'], shading?: WeaponPart['shading']) => void;
const collector = () => {
  const parts: WeaponPart[] = [];
  const add: Add = (name, slot, mesh, shading = 'auto') => parts.push({ name, slot, mesh, shading });
  return { parts, add };
};

/** Riflescope along X starting at x0, bore of the scope at height h. */
function riflescope(add: Add, x0: number, h: number, len: number, obj: number) {
  const eye = 0.0205;
  add('Luneta', 'anodized', B.merge(
    tubeX([[0.0175, x0], [eye, x0], [eye, x0 + 0.05], [0.015, x0 + 0.075], [0.015, x0 + len - 0.11], [obj, x0 + len - 0.05], [obj, x0 + len], [obj - 0.003, x0 + len + 0.002], [obj - 0.006, x0 + len + 0.002]], h, 0, 40),
    side(B.roundedRect(0.05, 0.034, 0.008, 4, x0 + 0.13, h), -0.017, 0.017, 0.004),
    place(B.lathe([[0, 0], [0.0125, 0], [0.0125, 0.004], [0.0132, 0.006], [0.0132, 0.017], [0.012, 0.02], [0, 0.0205]], 28), T.at(x0 + 0.13, h + 0.016, 0)),
    place(B.lathe([[0, 0], [0.011, 0], [0.011, 0.016], [0, 0.017]], 24), T.at(x0 + 0.13, h, 0.016), T.rx(Math.PI / 2)),
    place(B.lathe([[0, 0], [0.01, 0], [0.01, 0.012], [0, 0.013]], 24), T.at(x0 + 0.13, h, -0.016), T.rx(-Math.PI / 2)),
    tubeX([[0.0175, x0 + 0.045], [0.019, x0 + 0.045], [0.019, x0 + 0.06], [0.0175, x0 + 0.06]], h, 0, 32),
  ));
  add('Luneta (lentes)', 'lens', B.merge(turnX([[0, x0 + 0.004], [0.0175, x0 + 0.004], [0.0175, x0 + 0.006], [0, x0 + 0.006]], h, 0, 32), turnX([[0, x0 + len - 0.004], [obj - 0.004, x0 + len - 0.004], [obj - 0.004, x0 + len - 0.002], [0, x0 + len - 0.002]], h, 0, 32)));
}

export function buildSniper(p: Params): WeaponPart[] {
  const { parts, add } = collector();
  const BL = n(p, 'barrel');
  const muzzle = 0.215 + BL;
  // ---- action
  add('Receptor', 'dark', turnX([[0, -0.002], [0.0172, 0], [0.0175, 0.004], [0.0175, 0.215], [0, 0.216]], 0, 0, 32));
  add('Capa do ferrolho', 'dark', turnX([[0, -0.034], [0.0085, -0.033], [0.0122, -0.02], [0.0122, -0.002], [0, -0.001]], 0, 0, 24));
  add('Janela de ejeção (ferrolho)', 'bright', side(B.roundedRect(0.065, 0.016, 0.003, 3, 0.115, 0.004), 0.0158, 0.0178, 0.0006));
  add('Alavanca do ferrolho', 'bright', B.merge(B.tube([[0.03, 0.0, 0.012], [0.033, -0.006, 0.03], [0.038, -0.016, 0.046]], () => 0.0042, 12), place(B.lathe(Array.from({ length: 9 }, (_, i) => { const a = -Math.PI / 2 + (i / 8) * Math.PI; return [Math.cos(a) * 0.0095, Math.sin(a) * 0.0095] as V2; }), 20), T.at(0.039, -0.019, 0.05))));
  add('Trilho da luneta', 'anodized', picatinny(-0.005, 0.2, 0.0168));
  // ---- barrel / muzzle
  add('Cano pesado', 'dark', tubeX([[0.0039, 0.2], [0.0148, 0.2], [0.0148, 0.24], [0.0128, 0.32], [0.0108, muzzle - 0.01], [0.0102, muzzle], [0.0039, muzzle]], 0, 0, 32));
  const md = s(p, 'muzzle');
  if (md === 'freio')
    add('Freio de boca', 'dark', B.merge(tubeX([[0.0045, muzzle - 0.004], [0.0135, muzzle - 0.004], [0.0135, muzzle + 0.008], [0.0045, muzzle + 0.008]], 0, 0, 8), ...[0, 1, 2].map((i) => tubeX([[0.0055, muzzle + 0.018 + i * 0.014], [0.0135, muzzle + 0.018 + i * 0.014], [0.0135, muzzle + 0.024 + i * 0.014], [0.0055, muzzle + 0.024 + i * 0.014]], 0, 0, 8)), alongX([[-0.0135, 0.004], [0.0135, 0.004], [0.0135, 0.0125], [-0.0135, 0.0125]], muzzle + 0.008, muzzle + 0.06, 0.0008), alongX([[-0.0135, -0.0125], [0.0135, -0.0125], [0.0135, -0.004], [-0.0135, -0.004]], muzzle + 0.008, muzzle + 0.06, 0.0008)));
  else if (md === 'supressor') add('Supressor', 'dark', B.merge(tubeX([[0.0055, muzzle - 0.01], [0.021, muzzle - 0.01], [0.022, muzzle - 0.004], [0.022, muzzle + 0.18], [0.0205, muzzle + 0.186], [0.0055, muzzle + 0.186]], 0, 0, 36), tubeX([[0.022, muzzle + 0.01], [0.0228, muzzle + 0.01], [0.0228, muzzle + 0.03], [0.022, muzzle + 0.03]], 0, 0, 36)));
  // ---- stock (tactical, M24-type) with cheek riser
  // M24 (H-S Precision stock): length of pull ≈ 337 mm, overall 1092 mm with the 24" (610 mm) barrel
  const stock: V2[] = [
    [0.47, -0.009], [0.47, -0.03], [0.455, -0.038], [0.2, -0.046], [0.11, -0.05], [0.064, -0.052], [0.054, -0.06],
    [0.042, -0.118], [0.034, -0.13], [0.004, -0.132], [-0.0028, -0.12], [0.006, -0.068], [-0.0154, -0.056],
    [-0.231, -0.118], [-0.2464, -0.13], [-0.252, -0.12], [-0.252, -0.002], [-0.2415, 0.004], [-0.07, 0.002], [-0.0315, -0.012], [-0.014, -0.014], [0.0, -0.012],
  ];
  add('Coronha', 'polymer', side(stock, -0.0205, 0.0205, 0.0065, [], 3));
  add('Elevador de bochecha', 'polymer', B.merge(side(B.roundedRect(0.12, 0.012, 0.005, 3, -0.15, 0.0085), -0.0175, 0.0175, 0.004), ...[-0.12, -0.18].map((x) => place(B.lathe([[0, 0], [0.0035, 0], [0.0035, 0.01], [0, 0.0101]], 12), T.at(x, -0.0005, 0)))));
  add('Soleira de borracha', 'grip', side(B.roundedRect(0.012, 0.13, 0.005, 3, -0.258, -0.064), -0.0215, 0.0215, 0.004));
  add('Guarda-mato', 'dark', side([[0.06, -0.049], [0.112, -0.049], [0.112, -0.055], [0.1, -0.072], [0.074, -0.074], [0.06, -0.062]], -0.0055, 0.0055, 0.0008, [[[0.066, -0.0515], [0.106, -0.0515], [0.096, -0.0685], [0.076, -0.0705], [0.066, -0.06]]]));
  add('Gatilho', 'bright', side([[0.083, -0.048], [0.087, -0.048], [0.087, -0.056], [0.084, -0.064], [0.079, -0.066], [0.082, -0.058]], -0.0026, 0.0026, 0.0005));
  if (s(p, 'mag') === 'sim') add('Carregador', 'dark', side(B.roundedRect(0.075, 0.03, 0.004, 3, 0.152, -0.058), -0.0145, 0.0145, 0.002));
  const stud = () => B.lathe([[0, 0], [0.004, 0], [0.004, 0.008], [0, 0.0085]], 12);
  add('Pinos de bandoleira', 'dark', B.merge(place(stud(), T.at(0.32, -0.04, 0), T.rx(Math.PI)), place(stud(), T.at(-0.217, -0.11, 0), T.rx(Math.PI))));
  // ---- bipod
  const bp = s(p, 'bipod');
  if (bp !== 'nao') {
    const down = bp === 'aberto';
    const mount = side(B.roundedRect(0.03, 0.012, 0.003, 3, 0.42, -0.044), -0.016, 0.016, 0.002);
    const leg = (sz: number) =>
      down
        ? B.merge(B.tube([[0.42, -0.048, sz * 0.012], [0.428, -0.14, sz * 0.045], [0.434, -0.205, sz * 0.068]], (t) => 0.0055 - t * 0.0015, 12), place(B.lathe([[0, 0], [0.007, 0.001], [0.0075, 0.008], [0, 0.012]], 12), T.at(0.434, -0.217, sz * 0.068)))
        : B.tube([[0.41, -0.05, sz * 0.012], [0.3, -0.052, sz * 0.013], [0.24, -0.052, sz * 0.013]], () => 0.005, 12);
    add('Bipé', 'dark', B.merge(mount, leg(1), leg(-1)));
  }
  // ---- optic
  riflescope(add, -0.045, 0.0168 + 0.0094 + 0.032, n(p, 'scope'), 0.028);
  add('Anéis da luneta', 'anodized', B.merge(...[0.03, 0.15].map((x) => B.merge(tubeX([[0.015, x - 0.008], [0.0188, x - 0.008], [0.0188, x + 0.008], [0.015, x + 0.008]], 0.0168 + 0.0094 + 0.032, 0, 32), side(B.roundedRect(0.016, 0.026, 0.002, 2, x, 0.0168 + 0.0094 + 0.012), -0.0105, 0.0105, 0.0012)))));
  return parts;
}

export function buildShotgun(p: Params): WeaponPart[] {
  const { parts, add } = collector();
  const BL = n(p, 'barrel');
  // Remington 870 Express Tactical: 18.5" barrel from the breech (x = 0.2), length of pull 14" (356 mm),
  // overall ≈ 978 mm; trigger plate held by two pins, cross-bolt safety behind the trigger
  const muzzle = 0.2 + BL;
  const tubeEnd = Math.min(muzzle - 0.01, 0.2 + n(p, 'tube'));
  const wood = s(p, 'stock') === 'madeira';
  const furn = wood ? 'wood' : 'polymer';
  const HW = 0.0172;
  const recv: V2[] = [[0, -0.034], [0.2, -0.034], [0.206, -0.028], [0.206, 0.015], [0.196, 0.022], [0.024, 0.022], [0.006, 0.016], [0, 0.008]];
  add('Receptor (esq.)', 'dark', side(recv, -HW, 0, 0.0018));
  add('Receptor (dir.)', 'dark', side(recv, 0, HW, 0.0018, [B.roundedRect(0.075, 0.019, 0.003, 3, 0.11, 0.004)]));
  add('Ferrolho', 'bright', side(B.roundedRect(0.085, 0.015, 0.003, 3, 0.11, 0.004), 0.004, HW - 0.003, 0.001));
  add('Cano', 'dark', tubeX([[0.0092, 0.185], [0.0122, 0.185], [0.0122, 0.215], [0.0112, 0.225], [0.0112, muzzle], [0.0092, muzzle]], 0, 0, 32));
  add('Massa de mira (conta)', 'trim', place(B.lathe(Array.from({ length: 7 }, (_, i) => { const a = -Math.PI / 2 + (i / 6) * Math.PI; return [Math.cos(a) * 0.0022, Math.sin(a) * 0.0022] as V2; }), 12), T.at(muzzle - 0.01, 0.0128, 0)));
  if (s(p, 'rib') === 'sim') add('Faixa ventilada', 'dark', B.merge(alongX(B.roundedRect(0.008, 0.0025, 0.0008, 2, 0, 0.0158), 0.205, muzzle - 0.004, 0.0004), ...Array.from({ length: Math.floor((muzzle - 0.22) / 0.05) }, (_, i) => side(B.roundedRect(0.006, 0.004, 0.001, 2, 0.225 + i * 0.05, 0.0128), -0.002, 0.002, 0.0004))));
  add('Tubo do carregador', 'dark', B.merge(turnX([[0, 0.2], [0.0112, 0.2], [0.0112, tubeEnd], [0, tubeEnd]], -0.0245, 0, 28), turnX([[0, tubeEnd], [0.0132, tubeEnd], [0.0135, tubeEnd + 0.004], [0.0135, tubeEnd + 0.022], [0.011, tubeEnd + 0.026], [0, tubeEnd + 0.027]], -0.0245, 0, 28)));
  add('Braçadeira', 'dark', side(B.roundedRect(0.014, 0.05, 0.006, 3, tubeEnd - 0.012, -0.012), -0.0128, 0.0128, 0.002));
  // pump with grip rings
  const f0 = 0.235;
  const f1 = f0 + n(p, 'forend');
  const ring: V2[] = [[0.0205, f0]];
  const k = Math.round((f1 - f0) / 0.012);
  for (let i = 0; i < k; i++) {
    const x = f0 + 0.008 + i * ((f1 - f0 - 0.016) / k);
    ring.push([0.0215, x], [0.0225, x + 0.002], [0.0225, x + 0.007], [0.0215, x + 0.009]);
  }
  ring.push([0.0205, f1]);
  add('Telha (pump)', furn, tubeX([[0.0118, f0], ...ring, [0.0118, f1]], -0.0205, 0, 32));
  // trigger group
  add('Guarda-mato', 'dark', side([[0.012, -0.033], [0.087, -0.033], [0.087, -0.04], [0.074, -0.058], [0.032, -0.06], [0.012, -0.046]], -0.006, 0.006, 0.0009, [[[0.019, -0.0355], [0.08, -0.0355], [0.07, -0.054], [0.034, -0.0555], [0.02, -0.045]]]));
  add('Gatilho', 'dark', side([[0.05, -0.033], [0.054, -0.033], [0.054, -0.041], [0.051, -0.049], [0.046, -0.051], [0.049, -0.043]], -0.0028, 0.0028, 0.0006));
  add('Trava de segurança', 'dark', B.merge(pinZ(0.079, -0.0375, 0.0068, 0.003, 0.003), pinZ(0.079, -0.0375, -0.0068, 0.003, 0.003)));
  add('Pinos da placa do gatilho', 'dark', B.merge(...[0.018, 0.112].flatMap((x) => [pinZ(x, -0.027, HW + 0.0003, 0.0026, 0.0008, 14), pinZ(x, -0.027, -HW - 0.0003, 0.0026, 0.0008, 14)])));
  add('Retém da ação', 'dark', side(B.roundedRect(0.012, 0.004, 0.0015, 2, 0.097, -0.036), -0.0072, -0.0058, 0.0004));
  // stock
  if (s(p, 'stock') === 'tatica') {
    add('Empunhadura', 'polymer', place(side([[0.016, 0], [0.0155, -0.03], [0.02, -0.042], [0.016, -0.054], [0.0155, -0.085], [0.0125, -0.098], [0.004, -0.104], [-0.01, -0.102], [-0.017, -0.09], [-0.019, -0.012], [-0.014, 0]], -0.0145, 0.0145, 0.006, [], 3), T.at(-0.016, -0.033, 0), T.rz(-0.35)));
    add('Coronha', 'polymer', side([[-0.0017, 0.014], [-0.0017, -0.012], [-0.0255, -0.022], [-0.204, -0.074], [-0.2278, -0.084], [-0.2312, -0.074], [-0.2312, 0.022], [-0.204, 0.028], [-0.034, 0.026]], -0.019, 0.019, 0.004, [[[-0.0425, -0.012], [-0.17, -0.05], [-0.17, 0.0], [-0.051, 0.012]]], 3));
    add('Soleira de borracha', 'grip', side(B.roundedRect(0.01, 0.116, 0.004, 3, -0.2355, -0.03), -0.0205, 0.0205, 0.0035));
  } else {
    add('Coronha', furn, side([[0, 0.012], [0, -0.034], [-0.0291, -0.052], [-0.2739, -0.118], [-0.2922, -0.124], [-0.2922, -0.008], [-0.2739, -0.002], [-0.0498, 0.008], [-0.0166, 0.012]], -0.0185, 0.0185, 0.007, [], 3));
    add('Soleira de borracha', 'grip', side([[-0.2922, -0.125], [-0.3038, -0.125], [-0.3054, -0.066], [-0.3038, -0.007], [-0.2922, -0.007]], -0.0195, 0.0195, 0.004, [], 2));
  }
  return parts;
}

export function buildSMG(p: Params): WeaponPart[] {
  const { parts, add } = collector();
  const RX = 0.255;
  // receiver: rounded-top stamped tube with side ribs
  const prof: V2[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    prof.push([Math.cos(a) * 0.0158, 0.006 + Math.sin(a) * 0.0158]);
  }
  prof.push([-0.0158, -0.019], [-0.012, -0.022], [0.012, -0.022], [0.0158, -0.019]);
  add('Receptor', 'dark', alongX(prof, 0, RX, 0.0012, [], 2));
  add('Nervuras laterais', 'dark', B.merge(...[1, -1].flatMap((sz) => [-0.006, 0.006].map((y) => side(B.roundedRect(RX - 0.04, 0.0025, 0.001, 2, RX / 2, y), sz > 0 ? 0.0155 : -0.0168, sz > 0 ? 0.0168 : -0.0155, 0.0004)))));
  add('Janela de ejeção', 'bright', side(B.roundedRect(0.045, 0.014, 0.003, 3, 0.14, 0.005), 0.0145, 0.0163, 0.0005));
  add('Tubo de armar', 'dark', turnX([[0, RX - 0.02], [0.0088, RX - 0.02], [0.0088, RX + 0.1], [0.007, RX + 0.104], [0, RX + 0.105]], 0.0135, 0, 20));
  add('Alavanca de armar', 'dark', place(side([[0, 0], [0.006, 0], [0.008, 0.026], [0.003, 0.03], [-0.002, 0.026]], -0.003, 0.003, 0.0012), T.at(RX + 0.065, 0.017, -0.012), T.rx(-1.1)));
  // handguard (tropical) with grooves
  const hg: V2[] = B.roundedRect(0.041, 0.04, 0.012, 4, 0, -0.002);
  add('Guarda-mão', 'polymer', alongX(hg, RX + 0.002, RX + 0.105, 0.003, [], 2));
  add('Sulcos do guarda-mão', 'polymer', B.merge(...[0, 1, 2, 3, 4].map((i) => alongX(B.roundedRect(0.0425, 0.0415, 0.012, 4, 0, -0.002), RX + 0.015 + i * 0.018, RX + 0.019 + i * 0.018, 0.0008))));
  // MP5A3: 225 mm barrel from the bolt face (x = 0.205), 3-lug muzzle
  add('Cano', 'dark', B.merge(tubeX([[0.0045, RX + 0.1], [0.0075, RX + 0.1], [0.0075, 0.43], [0.0045, 0.43]], 0, 0, 24), ...[0, 1, 2].map((i) => place(alongX(B.roundedRect(0.004, 0.006, 0.0015, 2, 0, 0.009), 0.41, 0.418, 0.0005), T.rx((i * Math.PI * 2) / 3)))));
  add('Massa de mira', 'dark', B.merge(tubeX([[0.0105, RX + 0.09], [0.0135, RX + 0.09], [0.0135, RX + 0.098], [0.0105, RX + 0.098]], 0.032, 0, 24), side(B.roundedRect(0.02, 0.018, 0.004, 3, RX + 0.094, 0.022), -0.006, 0.006, 0.0015), place(B.lathe([[0, 0], [0.0012, 0], [0.001, 0.012], [0, 0.0122]], 8), T.at(RX + 0.094, 0.026, 0))));
  add('Alça de mira (tambor)', 'dark', B.merge(turnX([[0, 0.006], [0.0125, 0.006], [0.0125, 0.024], [0, 0.024]], 0.032, 0, 8), side(B.roundedRect(0.03, 0.02, 0.004, 3, 0.02, 0.02), -0.0085, 0.0085, 0.0015)));
  // trigger group (polymer) + grip
  add('Grupo do gatilho', 'polymer', side([[0.05, -0.02], [0.18, -0.02], [0.18, -0.034], [0.165, -0.046], [0.13, -0.05], [0.1, -0.05], [0.093, -0.04], [0.065, -0.04], [0.05, -0.03]], -0.0145, 0.0145, 0.003, [[[0.104, -0.036], [0.158, -0.036], [0.15, -0.046], [0.11, -0.047]]]));
  add('Empunhadura', 'polymer', place(side([[0.015, 0], [0.0145, -0.025], [0.0175, -0.036], [0.0145, -0.048], [0.0145, -0.068], [0.011, -0.08], [0.003, -0.085], [-0.01, -0.083], [-0.016, -0.074], [-0.0175, -0.01], [-0.012, 0]], -0.0145, 0.0145, 0.006, [], 3), T.at(0.078, -0.038, 0), T.rz(-0.28)));
  add('Gatilho', 'dark', side([[0.122, -0.034], [0.126, -0.034], [0.126, -0.041], [0.123, -0.047], [0.118, -0.049], [0.121, -0.042]], -0.0026, 0.0026, 0.0005));
  add('Seletor', 'dark', B.merge(pinZ(0.072, -0.03, -0.0152, 0.004, 0.0016), side([[0.07, -0.031], [0.088, -0.026], [0.089, -0.023], [0.07, -0.028]], -0.0176, -0.0156, 0.0005)));
  // curved 9 mm magazine
  const L = n(p, 'magLen');
  const A = 0.5 * (L / 0.2);
  const R = L / A;
  const secs: [number, number, number][][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * A;
    const cx = 0.2 + R * (1 - Math.cos(a));
    const cy = -0.02 - R * Math.sin(a);
    secs.push(B.roundedRect(0.032, 0.024, 0.004, 2, 0, 0).map(([x, z]) => [cx + x * Math.cos(a), cy + x * Math.sin(a), z] as [number, number, number]));
  }
  add('Carregador', 'dark', B.loft(secs));
  add('Boca do carregador', 'dark', side(B.roundedRect(0.042, 0.022, 0.004, 3, 0.2, -0.026), -0.0145, 0.0145, 0.002));
  // stock
  const st = s(p, 'stock');
  if (st === 'retratil') {
    const ext = n(p, 'stockPos');
    add('Coronha retrátil', 'dark', B.merge(
      // collapsed: butt ~12 cm behind the receiver (550 mm overall); fully out: 680 mm
      ...[1, -1].map((sz) => turnX([[0, -0.094 - ext], [0.0042, -0.094 - ext], [0.0042, 0.02], [0, 0.021]], -0.004, sz * 0.0128, 20)),
      side([[-0.094 - ext, 0.012], [-0.108 - ext, 0.016], [-0.112 - ext, -0.064], [-0.098 - ext, -0.066], [-0.092 - ext, -0.02]], -0.019, 0.019, 0.003),
    ));
    add('Soleira', 'grip', side(B.roundedRect(0.008, 0.082, 0.003, 3, -0.116 - ext, -0.025), -0.0195, 0.0195, 0.003));
  } else if (st === 'fixa') add('Coronha', 'polymer', side([[0, 0.016], [0, -0.022], [-0.03, -0.03], [-0.22, -0.07], [-0.235, -0.074], [-0.235, 0.012], [-0.21, 0.018], [-0.04, 0.02]], -0.0175, 0.0175, 0.004, [[[-0.04, -0.012], [-0.17, -0.042], [-0.17, 0.004], [-0.05, 0.008]]], 3));
  else add('Tampa traseira', 'polymer', alongX(B.roundedRect(0.03, 0.04, 0.008, 3, 0, -0.002), -0.012, 0.001, 0.003));
  add('Pinos de desmontagem', 'dark', B.merge(pinZ(0.03, -0.012, 0, 0.0028, 0.034), pinZ(0.186, -0.016, 0, 0.0028, 0.034)));
  add('Retém do carregador (pá)', 'dark', side([[0.168, -0.034], [0.18, -0.034], [0.182, -0.046], [0.172, -0.05], [0.168, -0.044]], -0.006, 0.006, 0.0008));
  return parts;
}

