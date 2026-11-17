import { WEAPONS, defaultParams, type Params, type WeaponType } from '@/modules/studio-3d/weapons/catalog';
import { DEFAULT_FINISH, type Finish } from '@/modules/studio-3d/weapons/textures';

/**
 * Local "text-to-3D" interpreter.
 *
 * There is no AI service here: the prompt is read with a rule-based vocabulary (PT-BR and EN)
 * and turned into a weapon type + shape parameters + finish of the procedural generator.
 * Everything the parser understood is reported back, so the user sees exactly what was applied.
 */

export type CamoPattern = 'nenhum' | 'solido' | 'woodland' | 'deserto' | 'digital' | 'urbano' | 'tigre';

export interface PromptResult {
  weapon: WeaponType;
  params: Params;
  finish: Finish;
  camo?: { pattern: CamoPattern; color?: string };
  /** The weapon type was named in the prompt (not the fallback). */
  typeFound?: boolean;
  /** Parameters the prompt set explicitly (an image reference must not override them). */
  explicit?: string[];
  /** Finish words were given (colour/coating). */
  finishFound?: boolean;
  /** Human-readable list of what was understood ("Tipo: Fuzil de assalto", "Ótica: Red dot"...). */
  understood: string[];
  /** Words that looked meaningful but were not recognised. */
  ignored: string[];
  /** Mesh quality asked for (hyper-realistic, millions of polygons…). */
  quality?: 'normal' | 'alta' | 'ultra' | 'cinema';
  /** Scene look (studio lighting, dramatic shadows, white background). */
  scene?: 'estudio' | 'dramatico' | 'claro';
  /** Still render settings (8K, --ar 16:9…). */
  render?: { res?: 'hd' | '4k' | '8k'; aspect?: '16:9' | '4:3' | '1:1' | '9:16' };
}

/** Lowercase, strip accents and punctuation (except . for calibres). */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Words matched during the current parse (to report the unrecognised ones). */
let matched = new Set<string>();
const has = (text: string, ...words: string[]) => {
  let hit = false;
  for (const w of words)
    if (new RegExp(`(^|[\\s-])${w.replace(/[.]/g, '\\.')}(?=$|[\\s-])`).test(text)) {
      hit = true;
      w.split(' ').forEach((x) => matched.add(x));
    }
  return hit;
};

/** Weapon type vocabulary, most specific first. */
const TYPE_RULES: [string, string[]][] = [
  ['energy-sword', ['sabre de luz', 'espada de energia', 'espada laser', 'lightsaber', 'energy sword']],
  ['plasma-rifle', ['rifle de plasma', 'fuzil de plasma', 'plasma rifle', 'plasma']],
  ['laser-pistol', ['pistola laser', 'blaster', 'laser pistol', 'pistola de raios']],
  ['magic-staff', ['cajado', 'staff', 'bastao magico']],
  ['sniper-hd', ['rifle de precisao', 'sniper', 'atirador', 'ferrolho', 'bolt action', 'precisao', 'm24', 'awp']],
  ['smg-hd', ['submetralhadora', 'smg', 'mp5', 'pdw']],
  ['smg', ['uzi']],
  ['shotgun-hd', ['espingarda', 'escopeta', 'shotgun', 'pump', 'calibre 12', 'cal 12', 'cal. 12', '870', 'doze']],
  ['ak-hd', ['ak', 'ak-47', 'ak47', 'akm', 'kalashnikov']],
  ['assault-rifle', ['fuzil simples', 'low poly']],
  ['ar15-hd', ['fuzil de assalto', 'fuzil', 'rifle de assalto', 'assault rifle', 'ar-15', 'ar15', 'm4', 'm16', 'carabina', 'rifle']],
  ['pistol', ['pistola simples', 'revolver']],
  ['pistol-hd', ['pistola', 'pistol', 'glock', 'handgun', '9mm', 'arma curta']],
  ['crossbow', ['besta', 'crossbow']],
  ['recurve-bow', ['arco recurvo', 'recurve']],
  ['longbow', ['arco longo', 'longbow']],
  ['arrow', ['flecha', 'arrow', 'virote']],
  ['katana', ['katana', 'nihonto', 'samurai']],
  ['dagger', ['adaga', 'punhal', 'faca', 'dagger', 'knife']],
  ['axe', ['machado', 'axe', 'labrys']],
  ['spear', ['lanca', 'spear', 'pique']],
  ['warhammer', ['martelo de guerra', 'martelo', 'warhammer', 'marreta']],
  ['shield', ['escudo', 'shield']],
  ['longsword', ['espada longa', 'espada', 'sword', 'montante']],
];

const OPTIC_HOLO = ['mira holografica', 'holografica', 'holo', 'eotech', 'holographic', 'holographic sight'];
const OPTIC_REDDOT = ['red dot', 'reddot', 'ponto vermelho', 'aimpoint'];
const OPTIC_SCOPE = ['luneta', 'scope', 'optical scope', 'mira telescopica', 'telescopica de mira', 'acog', 'magnifier', 'lupa', 'optic', 'optica'];

interface Ctx {
  t: string;
  w: WeaponType;
  p: Params;
  explicit: Set<string>;
  f: Finish;
  out: string[];
}

/** Set a choice parameter if the weapon has it and the option exists. */
function setChoice(c: Ctx, key: string, value: string) {
  const ch = c.w.choices.find((x) => x.key === key);
  const opt = ch?.options.find((o) => o.id === value);
  if (!ch || !opt) return false;
  c.p[key] = value;
  c.explicit.add(key);
  c.out.push(`${ch.label}: ${opt.label}`);
  return true;
}

/** Set a numeric parameter to a fraction (0..1) of its range. */
function setRange(c: Ctx, key: string, frac: number, note: string) {
  const n = c.w.nums.find((x) => x.key === key);
  if (!n) return false;
  c.p[key] = Math.round((n.min + (n.max - n.min) * frac) / n.step) * n.step;
  c.explicit.add(key);
  c.out.push(`${n.label}: ${note}`);
  return true;
}

export function parsePrompt(prompt: string, fallbackId = 'assault-rifle'): PromptResult {
  const t = normalize(prompt);
  matched = new Set();
  let weapon = WEAPONS.find((w) => w.id === fallbackId) ?? WEAPONS[0];
  let typeFound = false;
  for (const [id, words] of TYPE_RULES)
    if (has(t, ...words)) {
      weapon = WEAPONS.find((w) => w.id === id)!;
      typeFound = true;
      break;
    }
  const c: Ctx = { t, w: weapon, p: defaultParams(weapon), f: { ...DEFAULT_FINISH, ...weapon.finish }, out: [`Tipo: ${weapon.name}${typeFound ? '' : ' (padrão)'}`], explicit: new Set<string>() };
  let camo: PromptResult['camo'];

  // ---- attachments / shape
  const holoW = has(t, ...OPTIC_HOLO);
  const scopeW = has(t, ...OPTIC_SCOPE);
  // "optical scope and holographic sight" → holographic + 3× magnifier (the classic combo)
  if (holoW && scopeW && setChoice(c, 'optic', 'combo')) void 0;
  else if (holoW) setChoice(c, 'optic', 'holo') || setChoice(c, 'optic', 'reddot') || setChoice(c, 'scope', 'sim');
  else if (has(t, ...OPTIC_REDDOT)) setChoice(c, 'optic', 'reddot') || setChoice(c, 'scope', 'sim');
  else if (has(t, ...OPTIC_SCOPE)) setChoice(c, 'optic', 'luneta') || setChoice(c, 'scope', 'sim');
  else if (has(t, 'miras mecanicas', 'mira mecanica', 'iron sights', 'massa de mira', 'buis')) setChoice(c, 'optic', 'iron') || setChoice(c, 'optic', 'nenhuma');
  else if (has(t, 'sem mira', 'sem otica')) setChoice(c, 'optic', 'nenhuma');
  if (has(t, 'supressor', 'silenciador', 'suppressor', 'silencer', 'suprimido')) setChoice(c, 'suppressor', 'sim') || setChoice(c, 'muzzle', 'supressor');
  if (has(t, 'lanterna', 'flashlight', 'luz tatica')) setChoice(c, 'light', 'sim');
  if (has(t, 'ergonomic', 'ergonomica', 'ergonomico', 'ergonomic grip', 'ergonomic polymer grip')) setChoice(c, 'grip', 'ergo');
  if (has(t, 'bipe', 'bipod')) setChoice(c, 'bipod', 'aberto') || setChoice(c, 'bipod', 'sim');
  if (has(t, 'empunhadura frontal', 'foregrip', 'grip vertical')) setChoice(c, 'foregrip', 'sim');
  if (has(t, 'pmag', 'carregador de polimero', 'magazine de polimero')) setChoice(c, 'mag', 'polimero');
  else if (has(t, 'tambor', 'drum')) setChoice(c, 'mag', 'tambor');
  else if (has(t, 'carregador curvo', 'banana', 'curvo')) setChoice(c, 'mag', 'curvo');
  else if (has(t, 'carregador reto', 'stanag', 'reto')) setChoice(c, 'mag', 'reto');
  // AR-15 furniture named in the prompt
  if (has(t, 'bcm', 'gunfighter', 'coronha bcm')) setChoice(c, 'stock', 'bcm');
  if (has(t, 'springfield')) matched.add('springfield');
  if (has(t, 'moe', 'guarda-mao de polimero', 'guarda mao de polimero', 'guarda-mao polimero', 'massa de mira a2', 'massa a2', 'front sight a2', 'a2 front sight', 'saint')) setChoice(c, 'handguard', 'moe');
  else if (has(t, 'free float', 'free-float', 'guarda-mao de aluminio', 'guarda mao de aluminio', 'trilho m-lok de aluminio')) setChoice(c, 'handguard', 'mlok');
  if (has(t, 'pmag', 'carregador de polimero')) setChoice(c, 'mag', 'polimero');
  if (has(t, 'telescopica', 'retratil', 'coronha ajustavel', 'coronha m4')) setChoice(c, 'stock', 'telescopica') || setChoice(c, 'stock', 'm4');
  else if (has(t, 'dobravel', 'rebativel', 'folding')) setChoice(c, 'stock', 'dobravel') || setChoice(c, 'stock', 'retratil');
  else if (has(t, 'coronha fixa')) setChoice(c, 'stock', 'fixa');
  if (has(t, 'tatica', 'tatico', 'tactical') && c.w.id === 'shotgun-hd') setChoice(c, 'stock', 'tatica');
  else if (has(t, 'sem coronha', 'pistol grip only')) setChoice(c, 'stock', 'nenhuma');
  if (has(t, 'faixa ventilada', 'vent rib')) setChoice(c, 'rib', 'sim');
  if (has(t, 'freio de boca', 'compensador', 'muzzle brake')) setChoice(c, 'muzzle', 'freio');
  else if (has(t, 'quebra-chamas', 'quebra chamas', 'birdcage', 'flash hider')) setChoice(c, 'muzzle', 'a2');
  if (has(t, 'barbado', 'viking')) setChoice(c, 'style', 'barbado');
  if (has(t, 'duplo', 'dupla', 'labrys')) setChoice(c, 'style', 'duplo');
  if (has(t, 'sulco', 'fuller')) setChoice(c, 'fuller', 'sim');
  if (has(t, 'curvada')) setChoice(c, 'guardStyle', 'curvada');
  if (has(t, 'redondo')) setChoice(c, 'shape', 'redondo');
  if (has(t, 'heater', 'gotico')) setChoice(c, 'shape', 'heater');
  if (has(t, 'kite', 'pipa')) setChoice(c, 'shape', 'pipa');
  if (has(t, 'alada', 'asas')) setChoice(c, 'shape', 'alada');
  if (has(t, 'broadhead', 'caca')) setChoice(c, 'head', 'broadhead');
  if (has(t, 'bodkin', 'perfurante')) setChoice(c, 'head', 'bodkin');

  // ---- size words / calibres
  const lenKey = ['barrel', 'blade', 'shaft', 'haft', 'length', 'slide'].find((k) => weapon.nums.some((n) => n.key === k));
  if (lenKey) {
    if (has(t, 'curto', 'compacto', 'compacta', 'short', 'cqb', 'sbr')) setRange(c, lenKey, 0.1, 'curto');
    else if (has(t, 'longo', 'longa', 'long', 'pesado', 'heavy')) setRange(c, lenKey, 0.9, 'longo');
  }
  if (has(t, '7.62', '.308', '308', '7.62mm', '.50', '50 bmg', '.338')) {
    lenKey && setRange(c, lenKey, 0.85, 'calibre de longo alcance');
    weapon.nums.some((n) => n.key === 'handguard') && setRange(c, 'handguard', 0.8, 'calibre grosso');
  } else if (has(t, '5.56', '556', '5.56mm', '.223')) c.out.push('Calibre: 5.56 (padrão)');
  else if (has(t, '9mm', '9 mm', '.45', '.40')) c.out.push('Calibre: pistola');

  // ---- finishes
  const black = has(t, 'preto', 'preta', 'black', 'negro', 'cerakote preto', 'fosco preto');
  const matte = has(t, 'fosco', 'fosca', 'matte', 'matt');
  const titanium = has(t, 'titanio', 'titanium', 'dark titanium', 'titanio escuro');
  if (titanium) {
    c.f.steel = 'titanio';
    c.f.coat = black ? 'preto-fosco' : 'titanio';
    c.out.push(black ? 'Acabamento: preto fosco + titânio escuro' : 'Acabamento: titânio escuro');
  } else if (black && matte) c.f.coat = 'preto-fosco';
  if (black) {
    c.f.polymer = 'preto';
    if (!titanium && !has(t, 'polido', 'cromado', 'inox')) c.f.steel = 'escuro';
    if (!titanium) c.out.push('Acabamento: preto fosco');
  }
  if (has(t, 'fde', 'tan', 'areia', 'coyote', 'flat dark earth')) {
    c.f.polymer = 'areia';
    c.out.push('Polímero: areia (FDE)');
  }
  if (has(t, 'oliva', 'od green', 'verde oliva', 'verde')) {
    c.f.polymer = 'oliva';
    c.out.push('Polímero: verde oliva');
  }
  if (has(t, 'cinza', 'grafite', 'gray', 'grey')) {
    c.f.polymer = 'cinza';
    c.out.push('Polímero: cinza');
  }
  if (has(t, 'polido', 'cromado', 'inox', 'stainless', 'espelhado')) {
    c.f.steel = 'polido';
    c.out.push('Aço: polido');
  }
  if (has(t, 'damasco', 'damascus')) {
    c.f.steel = 'damasco';
    c.out.push('Aço: damasco');
  }
  if (has(t, 'enferrujado', 'ferrugem', 'oxidado', 'rust', 'rusty')) {
    c.f.steel = 'gasto';
    c.f.wear = 0.85;
    c.out.push('Aço: oxidado');
  }
  for (const [id, words] of [['ouro', ['ouro', 'dourado', 'gold']], ['latao', ['latao', 'brass']], ['bronze', ['bronze']], ['aco', ['detalhes em aco']]] as const)
    if (has(t, ...words)) {
      c.f.trim = id;
      c.out.push(`Detalhes: ${id}`);
    }
  for (const [id, words] of [['nogueira', ['nogueira', 'walnut']], ['carvalho', ['carvalho', 'oak']], ['ebano', ['ebano', 'ebony']], ['freixo', ['freixo', 'ash', 'madeira clara']]] as const)
    if (has(t, ...words)) {
      c.f.wood = id;
      c.out.push(`Madeira: ${id}`);
    }
  if (has(t, 'couro preto')) c.f.grip = 'couro-preto';
  else if (has(t, 'tecido', 'paracord', 'trancado', 'ito')) c.f.grip = 'tecido';
  else if (has(t, 'borracha', 'rubber')) c.f.grip = 'borracha';
  for (const [id, words] of [['vermelho', ['vermelho', 'vermelha', 'red', 'sith']], ['verde', ['energia verde']], ['roxo', ['roxo', 'roxa', 'purple', 'violeta']], ['laranja', ['laranja', 'orange']], ['azul', ['azul', 'blue']]] as const)
    if (has(t, ...words) && (weapon.category === 'scifi')) {
      c.f.energy = id;
      c.out.push(`Energia: ${id}`);
    }

  // ---- wear
  if (has(t, 'novo', 'nova', 'nunca usado', 'pristine', 'mint', 'de fabrica')) {
    c.f.wear = 0.05;
    c.out.push('Desgaste: novo');
  } else if (has(t, 'subtle wear', 'desgaste sutil', 'leve desgaste', 'subtle wear and tear', 'subtle')) {
    c.f.wear = 0.3;
    c.out.push('Desgaste: sutil nas bordas');
  } else if (has(t, 'desgastado', 'desgastada', 'gasto', 'battle worn', 'surrado', 'veterano', 'usado', 'arranhado', 'wear and tear', 'worn')) {
    c.f.wear = Math.max(c.f.wear, 0.8);
    c.out.push('Desgaste: alto');
  }

  // ---- camouflage
  const camoRules: [CamoPattern, string[]][] = [
    ['woodland', ['woodland', 'camuflado florestal', 'floresta', 'selva', 'jungle']],
    ['deserto', ['deserto', 'desert', 'multicam', 'arido']],
    ['digital', ['digital', 'pixelado', 'marpat']],
    ['urbano', ['urbano', 'urban', 'cidade']],
    ['tigre', ['tigre', 'tiger stripe', 'listrado']],
  ];
  for (const [pattern, words] of camoRules)
    if (has(t, ...words)) {
      camo = { pattern };
      c.out.push(`Camuflagem: ${pattern}`);
      break;
    }
  if (!camo && has(t, 'cerakote')) {
    camo = { pattern: 'solido', color: black ? '#1d1f22' : c.f.polymer === 'areia' ? '#9c8364' : c.f.polymer === 'oliva' ? '#4e5634' : '#3a3d41' };
    c.out.push('Cerakote: cor sólida');
  }

  // Unrecognised long words, to be transparent about the limits of the vocabulary.
  const known = new Set(['de', 'com', 'e', 'em', 'cal', 'calibre', 'acabamento', 'mm', 'tatico', 'tatica', 'tactical', 'modelo', 'arma', 'um', 'uma', 'the', 'with', 'and', 'of', 'modern', 'moderno', 'moderna', 'render', 'resolution', 'resolucao', 'details', 'detalhes', 'mechanical', 'mecanicos', 'finish', 'lighting', 'shadows', 'picatinny', 'rail', 'trilho', 'sight', 'edges', 'bordas', 'tear', 'grip', 'polymer', 'polimero', 'engine', 'unreal', 'masterpiece', 'intricate', 'hyper-realistic', 'photorealistic', 'subtle', 'dark', 'matte', 'studio', 'dramatic', 'optical', 'ergonomic', 'black', 'titanium', 'holographic', 'scope', 'assault', 'rifle', 'wear', '--ar', 'ar']);
  const flat = [...TYPE_RULES.flatMap(([, w]) => w), ...OPTIC_HOLO, ...OPTIC_REDDOT, ...OPTIC_SCOPE].join(' ');
  const ignored = t
    .split(' ')
    .filter((w) => w.length > 3 && !known.has(w) && !matched.has(w) && !flat.includes(w) && !c.out.some((o) => normalize(o).includes(w)) && !/^[\d.]+$/.test(w));

  // ---- realism, scene and render settings
  let quality: PromptResult['quality'];
  if (has(t, 'hyper-realistic', 'hyperrealistic', 'hiper-realista', 'hiper realista', 'photorealistic', 'fotorrealista', 'ultra realista', 'ultra-realista', 'unreal engine', 'unreal engine 5', 'milhoes de poligonos', 'millions of polygons', 'million polygons', 'high poly', 'intricate', 'masterpiece')) quality = 'cinema';
  else if (has(t, 'realistic', 'realista', 'detalhado', 'detailed')) quality = 'ultra';
  if (quality && c.w.hd) c.out.push(`Malha: ${quality === 'cinema' ? 'Cinema (milhões de triângulos)' : 'Ultra'}`);
  let scene: PromptResult['scene'];
  if (has(t, 'dramatic', 'dramatico', 'dramatica', 'cinematic', 'cinematografico', 'dramatic shadows', 'sombras dramaticas')) scene = 'dramatico';
  else if (has(t, 'white background', 'fundo branco', 'fundo claro', 'product shot')) scene = 'claro';
  else if (has(t, 'studio lighting', 'iluminacao de estudio', 'studio', 'estudio')) scene = 'estudio';
  if (scene) c.out.push(`Cena: ${scene === 'dramatico' ? 'estúdio dramático' : scene === 'claro' ? 'fundo claro' : 'estúdio'}`);
  const render: NonNullable<PromptResult['render']> = {};
  if (has(t, '8k')) render.res = '8k';
  else if (has(t, '4k', 'uhd')) render.res = '4k';
  else if (has(t, '1080p', 'full hd', 'fullhd')) render.res = 'hd';
  const ar = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(prompt);
  if (ar) {
    const key = `${ar[1]}:${ar[2]}`;
    if (key === '16:9' || key === '4:3' || key === '1:1' || key === '9:16') render.aspect = key;
  }
  if (render.res || render.aspect) c.out.push(`Render: ${render.res ? render.res.toUpperCase().replace('HD', 'Full HD') : ''}${render.res && render.aspect ? ' ' : ''}${render.aspect ?? ''}`);

  const finishFound = JSON.stringify(c.f) !== JSON.stringify({ ...DEFAULT_FINISH, ...weapon.finish });
  return { weapon, params: c.p, finish: c.f, camo, typeFound, explicit: [...c.explicit], finishFound, understood: c.out, ignored: [...new Set(ignored)].slice(0, 8), quality, scene, render: render.res || render.aspect ? render : undefined };
}
