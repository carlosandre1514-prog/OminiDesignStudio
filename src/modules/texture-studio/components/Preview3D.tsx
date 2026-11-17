import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { toBufferGeometry } from '@/modules/studio-3d/geometry';
import { buildWeapon, WEAPONS } from '@/modules/studio-3d/weapons/catalog';
import type { TextureMaps } from '../engine/compose';
import { selectDoc, useTextures } from '../store';
import { canPaint, strokeEnd, strokeMove, strokeStart } from './painting';

/** DataTexture with rows flipped so the image's top row maps to v = 1 (like a normal image texture). */
export function tex(data: Uint8ClampedArray, size: number, srgb: boolean, repeat: number) {
  const flipped = new Uint8Array(data.length);
  const row = size * 4;
  for (let y = 0; y < size; y++) flipped.set(data.subarray(y * row, y * row + row), (size - 1 - y) * row);
  const t = new THREE.DataTexture(flipped, size, size, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** PBR material with every map of the preview (colour, normal, roughness, metal, AO, emissive, displacement). */
export function useMapsMaterial(maps: TextureMaps | null, repeat: number, normalStrength: number, displacement: number) {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 1 });
    if (!maps) {
      m.color.set('#777');
      m.metalness = 0;
      m.roughness = 0.6;
      return m;
    }
    m.map = tex(maps.baseColor, maps.size, true, repeat);
    m.normalMap = tex(maps.normal, maps.size, false, repeat);
    m.roughnessMap = tex(maps.roughness, maps.size, false, repeat);
    m.metalnessMap = tex(maps.metallic, maps.size, false, repeat);
    m.aoMap = tex(maps.ao, maps.size, false, repeat);
    m.aoMap.channel = 0;
    m.emissiveMap = tex(maps.emissive, maps.size, true, repeat);
    m.emissive.set('#ffffff');
    m.emissiveIntensity = 2;
    m.displacementMap = tex(maps.height, maps.size, false, repeat);
    return m;
  }, [maps, repeat]);
  useEffect(() => {
    material.normalScale.set(normalStrength, normalStrength);
    material.displacementScale = displacement;
    material.displacementBias = -displacement / 2;
  }, [material, normalStrength, displacement]);
  useEffect(
    () => () => {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'displacementMap'] as const) material[k]?.dispose();
      material.dispose();
    },
    [material],
  );
  return material;
}

const rifleGeometry = (() => {
  let cache: THREE.BufferGeometry[] | null = null;
  return () => {
    if (!cache) {
      const w = WEAPONS.find((x) => x.id === 'assault-rifle')!;
      cache = buildWeapon(w, {}).map((p) => toBufferGeometry(p.mesh, { shading: p.shading ?? 'auto', uv: 'box' }));
    }
    return cache;
  };
})();

function Shape({ material, shape, onPaint }: { material: THREE.Material; shape: string; onPaint: (e: ThreeEvent<PointerEvent>, phase: 'down' | 'move') => void }) {
  const handlers = {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => onPaint(e, 'down'),
    onPointerMove: (e: ThreeEvent<PointerEvent>) => onPaint(e, 'move'),
  };
  switch (shape) {
    case 'cube':
      return <RoundedBox args={[1.5, 1.5, 1.5]} radius={0.06} smoothness={4} material={material} castShadow {...handlers} />;
    case 'plane':
      return (
        <mesh rotation={[-Math.PI / 2.6, 0, 0]} material={material} {...handlers}>
          <planeGeometry args={[2.4, 2.4, 256, 256]} />
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh material={material} castShadow {...handlers}>
          <cylinderGeometry args={[0.7, 0.7, 1.8, 96, 64]} />
        </mesh>
      );
    case 'rifle':
      return (
        <group scale={2.4} position={[-0.6, -0.1, 0]}>
          {rifleGeometry().map((g, i) => (
            <mesh key={i} geometry={g} material={material} castShadow {...handlers} />
          ))}
        </group>
      );
    default:
      return (
        <mesh material={material} castShadow {...handlers}>
          <sphereGeometry args={[1, 192, 128]} />
        </mesh>
      );
  }
}

export function Preview3D() {
  const maps = useTextures((s) => s.preview);
  const doc = useTextures(selectDoc);
  const painting = useTextures((s) => s.painting);
  const selected = useTextures((s) => s.selected);
  const [displace, setDisplace] = useState(true);
  const paintable = useMemo(() => canPaint(), [doc, painting, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const repeat = doc.previewShape === 'rifle' ? doc.previewTiling * 4 : doc.previewTiling;
  const material = useMapsMaterial(maps, repeat, doc.normalStrength, displace && doc.previewShape !== 'rifle' && doc.previewShape !== 'cube' ? 0.05 : 0);
  const down = useRef(false);

  const onPaint = (e: ThreeEvent<PointerEvent>, phase: 'down' | 'move') => {
    if (!paintable || !e.uv) return;
    if (phase === 'down') {
      e.stopPropagation();
      down.current = strokeStart(e.uv.x * repeat, 1 - e.uv.y * repeat);
    } else if (down.current) {
      e.stopPropagation();
      strokeMove(e.uv.x * repeat, 1 - e.uv.y * repeat);
    }
  };
  useEffect(() => {
    const up = () => {
      if (down.current) {
        down.current = false;
        strokeEnd();
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div className="relative h-full w-full" data-testid="texture-preview-3d">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 35, position: [2.6, 1.6, 3.6] }} onCreated={({ gl }) => (gl.toneMapping = THREE.ACESFilmicToneMapping)}>
        <color attach="background" args={['#1c2028']} />
        <ambientLight intensity={0.1} />
        <directionalLight position={[3, 5, 3]} intensity={2} castShadow />
        <Environment resolution={256}>
          <color attach="background" args={['#3b404b']} />
          <Lightformer form="rect" intensity={4} position={[0, 5, 3]} scale={[8, 2.5, 1]} />
          <Lightformer form="rect" intensity={2} position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[5, 3, 1]} />
          <Lightformer form="rect" intensity={2} position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[5, 3, 1]} />
          <Lightformer form="ring" intensity={1.5} color="#9ed8ff" position={[0, 2, -7]} scale={4} />
        </Environment>
        <Shape material={material} shape={doc.previewShape} onPaint={onPaint} />
        <ContactShadows position={[0, -1.25, 0]} opacity={0.5} scale={6} blur={2.5} far={3} />
        <OrbitControls makeDefault enabled={!paintable} enableDamping />
      </Canvas>
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
        {(['sphere', 'cube', 'cylinder', 'plane', 'rifle'] as const).map((s) => (
          <button
            key={s}
            className={`rounded px-2 py-1 text-[11px] ${doc.previewShape === s ? 'bg-accent-500 text-white' : 'bg-black/50 text-ink-200'}`}
            onClick={() => useTextures.getState().apply((d) => ({ ...d, previewShape: s }))}
          >
            {{ sphere: 'Esfera', cube: 'Cubo', cylinder: 'Cilindro', plane: 'Plano', rifle: 'Fuzil' }[s]}
          </button>
        ))}
        <button className={`rounded px-2 py-1 text-[11px] ${displace ? 'bg-ink-700 text-ink-100' : 'bg-black/50 text-ink-400'}`} onClick={() => setDisplace((v) => !v)} title="Deslocamento real pela altura">
          Relevo 3D
        </button>
      </div>
      {paintable && <div className="pointer-events-none absolute right-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-black">Pincel ativo — pinte no modelo</div>}
    </div>
  );
}
