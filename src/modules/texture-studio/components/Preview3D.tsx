import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { toBufferGeometry } from '@/modules/studio-3d/geometry';
import { buildWeapon, WEAPONS } from '@/modules/studio-3d/weapons/catalog';
import type { TextureMaps } from '../engine/compose';
import { selectDoc, useTextures } from '../store';
import { getTarget, suggestedModelScale, type LoadedTarget } from '../engine/target';
import type { PaintTarget } from '../engine/types';
import { canPaint, strokeEnd, strokeMove, strokeMove3D, strokeStart, strokeStart3D } from './painting';

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

/**
 * Skin: physical material with a soft reddish sheen and light wrapping around the terminator
 * (a cheap stand-in for subsurface scattering; the Godot export enables real SSS).
 */
function skinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 1, metalness: 1, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ff9a7a') });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      // wrap lighting: scattered light bleeds into the shadow side with a warm tint
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.32, 0.1, 0.06) * 0.6;`,
    );
  };
  m.customProgramCacheKey = () => 'omni-skin';
  return m;
}

/** PBR material with every map of the preview (colour, normal, roughness, metal, AO, emissive, displacement). */
export function useMapsMaterial(maps: TextureMaps | null, repeat: number, normalStrength: number, displacement: number, skin = false) {
  const material = useMemo(() => {
    const m = skin ? skinMaterial() : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 1 });
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
  }, [maps, repeat, skin]);
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

/** Loads the 3D painting target (objects of a 3D Studio project) once per target. */
function useTarget(t: PaintTarget | undefined) {
  const [state, setState] = useState<{ key: string; target?: LoadedTarget; error?: string } | null>(null);
  const key = t ? `${t.projectId}|${t.objectIds.join(',')}` : '';
  useEffect(() => {
    if (!t) return;
    let alive = true;
    setState({ key });
    getTarget(t)
      .then((target) => {
        if (!alive) return;
        setState({ key, target });
        // first time on this model: patterns at real-world scale (~30 cm per repeat)
        const st = useTextures.getState();
        if (st.previewSize === 256) st.set({ previewSize: 512 });
        if (selectDoc(st).modelScale === undefined) {
          st.live((d) => ({ ...d, modelScale: suggestedModelScale(target) }));
          st.endGesture();
        }
      })
      .catch((e) => alive && setState({ key, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state?.key === key ? state : null;
}

type V3 = [number, number, number];

function ModelTarget({ target, material, paintable }: { target: LoadedTarget; material: THREE.Material; paintable: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const down = useRef(false);
  const brushSize = useTextures((s) => s.brush.size);
  const sphere = target.geometry.boundingSphere!;
  const scale = 1.7 / (sphere.radius || 1);
  const R = target.painter.radius(brushSize);
  const hit = (e: ThreeEvent<PointerEvent>): { p: V3; n: V3 } | null => {
    if (!e.face) return null;
    const p = e.object.worldToLocal(e.point.clone());
    const n = e.face.normal;
    return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
  };
  const moveRing = (h: { p: V3; n: V3 } | null) => {
    const r = ring.current;
    if (!r) return;
    r.visible = !!h && paintable;
    if (!h) return;
    r.position.set(h.p[0] + h.n[0] * R * 0.02, h.p[1] + h.n[1] * R * 0.02, h.p[2] + h.n[2] * R * 0.02);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...h.n));
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
    <group scale={scale} position={[-sphere.center.x * scale, -sphere.center.y * scale, -sphere.center.z * scale]}>
      <mesh
        geometry={target.geometry}
        material={material}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          if (!paintable || e.button !== 0) return;
          const h = hit(e);
          if (!h) return;
          e.stopPropagation();
          down.current = strokeStart3D(target.painter, h.p, h.n);
        }}
        onPointerMove={(e) => {
          const h = hit(e);
          moveRing(h);
          if (down.current && h) {
            e.stopPropagation();
            strokeMove3D(h.p, h.n);
          }
        }}
        onPointerOut={() => moveRing(null)}
      />
      <mesh ref={ring} visible={false} renderOrder={10}>
        <ringGeometry args={[R * 0.92, R, 48]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Preview3D() {
  const maps = useTextures((s) => s.preview);
  const doc = useTextures(selectDoc);
  const painting = useTextures((s) => s.painting);
  const selected = useTextures((s) => s.selected);
  const [displace, setDisplace] = useState(true);
  const paintable = useMemo(() => canPaint(), [doc, painting, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const onModel = doc.previewShape === 'model' && !!doc.target;
  const target = useTarget(onModel ? doc.target : undefined);
  const repeat = onModel ? 1 : doc.previewShape === 'rifle' ? doc.previewTiling * 4 : doc.previewTiling;
  const material = useMapsMaterial(maps, repeat, doc.normalStrength, displace && !onModel && doc.previewShape !== 'rifle' && doc.previewShape !== 'cube' ? 0.05 : 0, doc.surface === 'skin');
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
        {onModel ? target?.target && <ModelTarget target={target.target} material={material} paintable={paintable} /> : <Shape material={material} shape={doc.previewShape} onPaint={onPaint} />}
        <ContactShadows position={[0, onModel ? -1.8 : -1.25, 0]} opacity={0.5} scale={6} blur={2.5} far={3} />
        {onModel ? (
          // on a model one finger / left button paints, two fingers / right button orbit
          <OrbitControls
            makeDefault
            enableDamping
            mouseButtons={{ LEFT: (paintable ? -1 : THREE.MOUSE.ROTATE) as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: paintable ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN }}
            touches={{ ONE: (paintable ? -1 : THREE.TOUCH.ROTATE) as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE }}
          />
        ) : (
          <OrbitControls makeDefault enabled={!paintable} enableDamping />
        )}
      </Canvas>
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
        {doc.target && (
          <button className={`rounded px-2 py-1 text-[11px] ${onModel ? 'bg-accent-500 text-white' : 'bg-black/50 text-ink-200'}`} onClick={() => useTextures.getState().apply((d) => ({ ...d, previewShape: 'model' }))} data-testid="preview-model">
            Modelo: {doc.target.name}
          </button>
        )}
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
      {paintable && (
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-black">
          {onModel ? 'Pincel ativo — 1 dedo/botão esquerdo pinta · 2 dedos/botão direito giram' : 'Pincel ativo — pinte no modelo'}
        </div>
      )}
      {onModel && !target?.target && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-300" data-testid="paint-model-status">
          {target?.error ? `Não foi possível carregar o modelo: ${target.error}` : 'Preparando o modelo (UV automática e leitura da malha)…'}
        </div>
      )}
      {onModel && target?.target && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[11px] text-ink-300" data-testid="paint-model-info">
          {target.target.triangles.toLocaleString('pt-BR')} triângulos · UV atlas{target.target.charts ? ` (${target.target.charts} ilhas)` : ''}
        </div>
      )}
    </div>
  );
}
