import { Edges } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { toBufferGeometry } from '@/modules/studio-3d/geometry';
import { useShallow } from 'zustand/react/shallow';
import { isHorizontal } from '@/modules/studio-3d/weapons/assemble';
import type { TextureMaps } from '@/modules/texture-studio/engine/compose';
import { QUALITY, type Slot } from '@/modules/studio-3d/weapons/catalog';
import { buildDense } from '../lib/denseRunner';
import { edgeWearAttributes } from '../lib/surface';
import { textureProjectMaps } from '../lib/textureLink';
import { partVisible, useArsenal, weaponById } from '../store';
import { useWeaponMaterials } from './useWeaponMaterials';

/** Evaluate the Texture Studio projects assigned to slots (async, cached per project version). */
function useCustomMaps(custom: Partial<Record<Slot, { id: string }>>) {
  const [maps, setMaps] = useState<Partial<Record<Slot, TextureMaps>>>({});
  const key = JSON.stringify(custom);
  useEffect(() => {
    let alive = true;
    const entries = Object.entries(custom) as [Slot, { id: string }][];
    if (!entries.length) {
      setMaps({});
      return;
    }
    useArsenal.getState().set({ status: { kind: 'busy', text: 'Aplicando texturas do estúdio…' } });
    Promise.all(entries.map(async ([slot, c]) => [slot, await textureProjectMaps(c.id)] as const))
      .then((list) => {
        if (!alive) return;
        setMaps(Object.fromEntries(list));
        useArsenal.getState().set({ status: { kind: 'ready', text: 'Pronto' } });
      })
      .catch((e) => alive && useArsenal.getState().set({ status: { kind: 'error', text: e instanceof Error ? e.message : 'Falha ao carregar textura' } }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return maps;
}

/** The group that is exported (GLB/GLTF/OBJ) — set while the model is mounted. */
export const exportRoot: { current: THREE.Group | null } = { current: null };

/**
 * The weapon: one mesh per part, PBR materials per slot, exploded view (parts slide away from the
 * centre for disassembly), hide / isolate, click to select (cyan outline).
 */
export function WeaponModel() {
  const { parts, finish, camo, edgeWear, roughness, metalness, explode, selected, hidden, solo, weaponId, source } = useArsenal(
    useShallow((s) => ({ parts: s.parts, finish: s.finish, camo: s.camo, edgeWear: s.edgeWear, roughness: s.roughness, metalness: s.metalness, explode: s.explode, selected: s.selected, hidden: s.hidden, solo: s.solo, weaponId: s.weaponId, source: s.source })),
  );
  const horizontal = source === 'image' || isHorizontal(weaponById(weaponId));
  const custom = useArsenal((s) => s.custom);
  const customScale = useArsenal((s) => s.customScale);
  const customMaps = useCustomMaps(custom);
  const photo = useArsenal((s) => s.photo);
  const materials = useWeaponMaterials(parts.map((p) => p.slot), { finish, camo, edgeWear, roughness, metalness, horizontal, custom: customMaps, customScale, photo });

  const model = useMemo(() => {
    const items = parts.map((p) => {
      const geometry = toBufferGeometry(p.mesh, { shading: p.shading ?? 'auto', uv: p.uv ?? 'box' });
      const wear = edgeWearAttributes(p.mesh);
      // segmented parts: the internal butt joints are not real edges, so no edge wear there
      if (p.subdiv === false) wear.edgeH.fill(-1);
      geometry.setAttribute('bary', new THREE.BufferAttribute(wear.bary, 3));
      geometry.setAttribute('edgeH', new THREE.BufferAttribute(wear.edgeH, 3));
      return { part: p, geometry };
    });
    // Explode directions: from the weapon centre to each part centre.
    const all = new THREE.Box3();
    items.forEach((i) => i.geometry.boundingBox && all.union(i.geometry.boundingBox));
    const center = all.getCenter(new THREE.Vector3());
    const size = all.getSize(new THREE.Vector3()).length();
    const lift = Number.isFinite(all.min.y) ? -all.min.y : 0;
    const list = items.map((i, idx) => {
      const c = i.geometry.boundingBox!.getCenter(new THREE.Vector3());
      const dir = c.sub(center);
      if (dir.lengthSq() < 1e-8) dir.set(0, idx % 2 ? -1 : 1, 0);
      return { ...i, offset: dir.normalize().multiplyScalar(size * 0.16) };
    });
    return { list, lift };
  }, [parts]);
  const built = model.list;
  useEffect(() => () => built.forEach((b) => b.geometry.dispose()), [built]);

  // High-poly path: subdivide in a worker, swap the geometries in when ready (low-poly shown meanwhile).
  const quality = useArsenal((s) => s.quality);
  const levels = source === 'image' ? 0 : QUALITY[quality].subdiv;
  const [dense, setDense] = useState<(THREE.BufferGeometry | null)[] | null>(null);
  useEffect(() => {
    setDense(null);
    if (!levels) return;
    let alive = true;
    const st = useArsenal.getState();
    st.set({ status: { kind: 'busy', text: `Gerando malha ${QUALITY[quality].label} (subdivisão ×${4 ** levels})…` } });
    const subd = parts.map((p) => p.subdiv !== false);
    buildDense(parts.filter((_, i) => subd[i]).map((p) => p.mesh), levels, (pr) => alive && useArsenal.getState().set({ status: { kind: 'busy', text: `Gerando malha ${QUALITY[quality].label}: ${Math.round(pr * 100)}%` } }))
      .then((geos) => {
        if (!alive) return;
        let total = 0;
        const made = geos.map((g) => {
          const b = new THREE.BufferGeometry();
          b.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
          b.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
          const uv = new THREE.BufferAttribute(g.uv, 2);
          b.setAttribute('uv', uv);
          b.setAttribute('uv1', uv);
          b.setAttribute('curv', new THREE.BufferAttribute(g.curv, 1));
          b.setIndex(new THREE.BufferAttribute(g.index, 1));
          b.computeBoundingBox();
          b.computeBoundingSphere();
          total += g.triangles;
          return b;
        });
        // parts that must not be subdivided keep their exact (low-poly path) geometry: null = use the base one
        let gi = 0;
        const list = subd.map((ok, i) => {
          if (ok) return made[gi++];
          total += (built[i]?.geometry.getAttribute('position').count ?? 0) / 3;
          return null;
        });
        setDense(list);
        useArsenal.getState().set({ status: { kind: 'ready', text: `Pronto · ${(total / 1e6).toFixed(total > 1e6 ? 2 : 3)} milhões de triângulos` } });
      })
      .catch((e) => alive && useArsenal.getState().set({ status: { kind: 'error', text: e instanceof Error ? e.message : 'Falha na malha de alta resolução' } }));
    return () => {
      alive = false;
    };
  }, [parts, levels, quality]);
  useEffect(() => () => dense?.forEach((g) => g?.dispose()), [dense]);

  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    exportRoot.current = group.current;
    return () => {
      exportRoot.current = null;
    };
  }, []);

  // Smoothly animate the exploded offsets.
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 10);
    built.forEach((b, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const target = b.offset.clone().multiplyScalar(explode);
      m.position.lerp(target, k);
    });
  });

  const select = (key: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useArsenal.getState().set({ selected: useArsenal.getState().selected === key ? null : key });
  };

  return (
    <group ref={group} name="Arma" position={[0, model.lift, 0]}>
      {built.map((b, i) => (
        <mesh
          key={b.part.key}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          name={b.part.name}
          geometry={dense?.[i] ?? b.geometry}
          material={materials.get(b.part.slot)}
          visible={partVisible({ hidden, solo }, b.part.key)}
          castShadow
          receiveShadow
          onClick={select(b.part.key)}
        >
          {selected === b.part.key && !dense && <Edges threshold={25} color="#22d3ee" />}
        </mesh>
      ))}
    </group>
  );
}
