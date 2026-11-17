import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { importAssetBytes } from '@/core/assets/assetService';
import { Modal } from '@/ui/Modal';
import { toast } from '@/ui/toast';
import { toBufferGeometry } from '../geometry';
import * as ops from '../ops';
import { useStudio3D } from '../store';
import { assembleWeapon, isHorizontal, UV_REPEAT, type TextureIds } from '../weapons/assemble';
import { buildWeapon, CATEGORY_LABELS, defaultParams, randomParams, WEAPONS, type Category, type Params, type WeaponPart, type WeaponType } from '../weapons/catalog';
import { DEFAULT_FINISH, encodePng, FINISH_LABELS, materialFor, texturesFor, type Finish, type MaterialSpec } from '../weapons/textures';

const PREVIEW_TEX = 256;
const FINAL_TEX = 512;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
/** Finish options that matter for each category (others stay available under "Mais acabamentos"). */
const FINISH_KEYS = Object.keys(FINISH_LABELS) as (keyof typeof FINISH_LABELS)[];

function dataTexture(rgba: Uint8ClampedArray, size: number, srgb: boolean, horizontal: boolean) {
  const t = new THREE.DataTexture(new Uint8Array(rgba.buffer.slice(0)), size, size, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(UV_REPEAT, UV_REPEAT);
  t.center.set(0.5, 0.5);
  t.rotation = horizontal ? Math.PI / 2 : 0;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function previewMaterial(spec: MaterialSpec, horizontal: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: spec.color, metalness: spec.metalness, roughness: spec.roughness });
  if (spec.emissive) {
    m.emissive.set(spec.emissive);
    m.emissiveIntensity = spec.emissiveIntensity ?? 1;
  }
  if (spec.opacity !== undefined && spec.opacity < 1) {
    m.transparent = true;
    m.opacity = spec.opacity;
  }
  if (spec.pattern) {
    const tex = texturesFor(spec.pattern, PREVIEW_TEX);
    m.map = dataTexture(tex.color, tex.size, true, horizontal);
    m.roughnessMap = dataTexture(tex.roughness, tex.size, false, horizontal);
    m.normalMap = dataTexture(tex.normal, tex.size, false, horizontal);
    const ns = spec.normalScale ?? 1;
    m.normalScale.set(ns, ns);
  }
  return m;
}

function Preview({ weapon, parts, finish }: { weapon: WeaponType; parts: WeaponPart[]; finish: Finish }) {
  const horizontal = isHorizontal(weapon);
  const meshes = useMemo(() => {
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    return parts.map((p) => {
      const spec = materialFor(p.slot, finish);
      let mat = mats.get(spec.key);
      if (!mat) mats.set(spec.key, (mat = previewMaterial(spec, horizontal)));
      return { name: p.name, geometry: toBufferGeometry(p.mesh, { shading: p.shading ?? 'auto', uv: 'box' }), material: mat };
    });
  }, [parts, finish, horizontal]);
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        m.geometry.dispose();
        for (const t of [m.material.map, m.material.roughnessMap, m.material.normalMap]) t?.dispose();
        m.material.dispose();
      }),
    [meshes],
  );
  const { center, radius } = useMemo(() => {
    const box = new THREE.Box3();
    meshes.forEach((m) => m.geometry.boundingBox && box.union(m.geometry.boundingBox));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center, radius: Math.max(0.05, sphere.radius) };
  }, [meshes]);
  const dist = radius / Math.sin((40 * Math.PI) / 360) * 1.05;
  return (
    <Canvas
      key={weapon.id}
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ fov: 40, near: radius / 50, far: radius * 50, position: [center.x + dist * 0.35, center.y + dist * 0.2, center.z + dist * 0.92] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
      data-testid="weapon-preview"
    >
      <color attach="background" args={['#15171c']} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <Environment resolution={128}>
        <color attach="background" args={['#3b404b']} />
        <Lightformer form="rect" intensity={0.8} position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="ring" intensity={1} position={[0, 2, -6]} scale={3} />
      </Environment>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={m.material} name={m.name} />
      ))}
      <OrbitControls target={center} autoRotate autoRotateSpeed={1.6} enablePan={false} minDistance={radius * 0.3} maxDistance={radius * 6} makeDefault />
    </Canvas>
  );
}

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

/** Generate the final textures, store them in the Asset Library and add the weapon to the scene. */
async function addToScene(weapon: WeaponType, parts: WeaponPart[], finish: Finish, projectId: string | null) {
  const textures: Record<string, TextureIds> = {};
  const specs = new Map<string, MaterialSpec>();
  for (const p of parts) {
    const spec = materialFor(p.slot, finish);
    if (spec.pattern) specs.set(spec.key, spec);
  }
  for (const spec of specs.values()) {
    await yieldFrame();
    const tex = texturesFor(spec.pattern!, FINAL_TEX);
    const ids: TextureIds = {};
    for (const [map, data, label] of [
      ['map', tex.color, 'cor'],
      ['roughnessMap', tex.roughness, 'rugosidade'],
      ['normalMap', tex.normal, 'normal'],
    ] as const) {
      const bytes = await encodePng(data, tex.size);
      const r = await importAssetBytes(`arma-${spec.key}-${label}.png`, bytes, {
        name: `${spec.name} — ${label}`,
        category: 'textures',
        tags: ['arma', 'procedural', 'pbr'],
        projectId,
      });
      if (r.status === 'error') throw new Error(r.error);
      ids[map] = r.asset.id;
    }
    textures[spec.key] = ids;
  }
  const s = useStudio3D.getState();
  let groupId = '';
  s.apply((doc) => {
    const r = assembleWeapon(doc, weapon, parts, finish, textures);
    groupId = r.groupId;
    return r.doc;
  });
  s.select([groupId]);
  // Frame the new weapon so it fills the view (weapons are real-size, often smaller than the default cube).
  const box = ops.worldBox(useStudio3D.getState().history.present, groupId);
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.1, box.getSize(new THREE.Vector3()).length() / 2);
  const d = r * 3.6;
  s.setCamera({ target: [c.x, c.y, c.z], position: [c.x + d * 0.5, c.y + d * 0.35, c.z + d * 0.8] }, true);
}

export function WeaponGenerator({ onClose }: { onClose: () => void }) {
  const projectId = useStudio3D((s) => s.projectId);
  const [category, setCategory] = useState<Category>('melee');
  const [weaponId, setWeaponId] = useState('longsword');
  const weapon = WEAPONS.find((w) => w.id === weaponId)!;
  const [params, setParams] = useState<Params>(() => defaultParams(weapon));
  const [seed, setSeed] = useState(1);
  const [finish, setFinish] = useState<Finish>(DEFAULT_FINISH);
  const [busy, setBusy] = useState(false);
  const parts = useMemo(() => buildWeapon(weapon, params, seed), [weapon, params, seed]);
  const usedSlots = useMemo(() => new Set(parts.map((p) => p.slot)), [parts]);

  const pick = (w: WeaponType) => {
    setWeaponId(w.id);
    setParams(defaultParams(w));
    setSeed(1);
  };
  const randomize = () => {
    const next = Math.floor(Math.random() * 1e9) + 1;
    setSeed(next);
    setParams(randomParams(weapon, next));
  };

  // Show only the finishes that affect the parts of this weapon.
  const relevant: Record<(typeof FINISH_KEYS)[number], boolean> = {
    steel: usedSlots.has('blade') || usedSlots.has('metal'),
    coat: usedSlots.has('anodized'),
    trim: usedSlots.has('trim'),
    wood: usedSlots.has('wood'),
    grip: usedSlots.has('grip'),
    polymer: usedSlots.has('polymer'),
    energy: usedSlots.has('glow') || usedSlots.has('crystal'),
  };

  const add = async () => {
    setBusy(true);
    try {
      await addToScene(weapon, parts, finish, projectId);
      toast.success(`"${weapon.name}" adicionada à cena — ${parts.length} peças editáveis`);
      onClose();
    } catch (e) {
      toast.error(`Não foi possível gerar a arma: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="Gerador de armas 3D"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-primary" onClick={add} disabled={busy} data-testid="weapon-add">
            {busy ? 'Gerando texturas…' : 'Adicionar à cena'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative h-[40vh] min-h-56 overflow-hidden rounded-lg border border-ink-800 sm:h-auto sm:min-h-96 sm:w-1/2 sm:shrink-0">
          <Preview weapon={weapon} parts={parts} finish={finish} />
          <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-ink-400">
            {parts.length} peças · {parts.reduce((s, p) => s + p.mesh.f.length, 0).toLocaleString('pt-BR')} faces · arraste para girar
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Categoria">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                className={`rounded-full px-3 py-1.5 text-xs ${category === c ? 'bg-accent-600 text-white' : 'bg-ink-800 text-ink-300'}`}
                onClick={() => {
                  setCategory(c);
                  pick(WEAPONS.find((w) => w.category === c)!);
                }}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" aria-label="Tipo de arma">
            {WEAPONS.filter((w) => w.category === category).map((w) => (
              <button
                key={w.id}
                className={`rounded-md border px-2.5 py-1.5 text-xs ${w.id === weapon.id ? 'border-accent-500 text-ink-100' : 'border-ink-700 text-ink-300'}`}
                onClick={() => pick(w)}
                aria-pressed={w.id === weapon.id}
              >
                {w.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-400">{weapon.description}</p>
          <div className="flex gap-2">
            <button className="btn-outline flex-1 text-xs" onClick={randomize} data-testid="weapon-random">🎲 Variação aleatória</button>
            <button className="btn-ghost text-xs" onClick={() => pick(weapon)}>Restaurar</button>
          </div>

          {(weapon.nums.length > 0 || weapon.choices.length > 0) && <div className="section-title">Forma</div>}
          {weapon.nums.map((x) => (
            <label key={x.key} className="block text-xs">
              <div className="flex justify-between text-ink-300">
                <span>{x.label}</span>
                <span className="tabular-nums text-ink-400">
                  {x.unit === 'm' ? `${Math.round(Number(params[x.key]) * 100)} cm` : `${Number(params[x.key]).toFixed(x.step < 1 ? 2 : 0)}${x.unit && x.unit !== '°' ? ` ${x.unit}` : x.unit ?? ''}`}
                </span>
              </div>
              <input
                type="range"
                className="w-full accent-accent-500"
                min={x.min}
                max={x.max}
                step={x.step}
                value={Number(params[x.key])}
                aria-label={x.label}
                onChange={(e) => setParams({ ...params, [x.key]: Number(e.target.value) })}
              />
            </label>
          ))}
          {weapon.choices.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {weapon.choices.map((c) => (
                <label key={c.key} className="text-xs text-ink-300">
                  {c.label}
                  <select className="input mt-0.5 w-full py-1 text-xs" value={String(params[c.key])} onChange={(e) => setParams({ ...params, [c.key]: e.target.value })} aria-label={c.label}>
                    {c.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="section-title">Materiais</div>
          <div className="grid grid-cols-2 gap-2">
            {FINISH_KEYS.filter((k) => relevant[k]).map((k) => {
              const def = FINISH_LABELS[k];
              return (
                <label key={k} className="text-xs text-ink-300">
                  {def.label}
                  <select className="input mt-0.5 w-full py-1 text-xs" value={finish[k]} aria-label={def.label} onChange={(e) => setFinish({ ...finish, [k]: e.target.value })}>
                    {Object.entries(def.options).map(([id, label]) => <option key={id} value={id}>{label as string}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <label className="block text-xs">
            <div className="flex justify-between text-ink-300">
              <span>Desgaste (arranhões, sujeira)</span>
              <span className="text-ink-400">{Math.round(finish.wear * 100)}%</span>
            </div>
            <input type="range" className="w-full accent-accent-500" min={0} max={1} step={0.05} value={finish.wear} aria-label="Desgaste" onChange={(e) => setFinish({ ...finish, wear: Number(e.target.value) })} />
          </label>
          <p className="text-[10px] leading-snug text-ink-400">
            Gerado no próprio aparelho, sem internet nem IA externa. As texturas PBR (cor, rugosidade e relevo) vão para a Asset Library e cada peça vira uma malha editável no estúdio.
          </p>
        </div>
      </div>
    </Modal>
  );
}
