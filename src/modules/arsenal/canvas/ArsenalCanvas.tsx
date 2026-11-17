import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useArsenal } from '../store';
import { exportRoot, WeaponModel } from './WeaponModel';
import { bridge } from './renderImage';

/** Studio PBR lighting: soft box lights (reflections on metal), key light with shadow, rim light. */
export type SceneLook = 'estudio' | 'dramatico' | 'claro';
export const SCENE_LABELS: Record<SceneLook, string> = { estudio: 'Estúdio', dramatico: 'Estúdio dramático', claro: 'Fundo claro (produto)' };

/** Key spot aimed at the weapon (its target must live in the scene graph to be used). */
function KeySpot() {
  const light = useRef<THREE.SpotLight>(null);
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(0.12, 0.05, 0);
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  return <spotLight ref={light} position={[0.35, 1.75, 1.05]} angle={0.34} penumbra={0.85} intensity={34} decay={2} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0002} shadow-radius={6} />;
}

/** Dark studio with a hard key spot, coloured rim lights, light strips for long metal reflections and a glossy floor. */
function DramaticLighting() {
  return (
    <>
      <color attach="background" args={['#08090c']} />
      <ambientLight intensity={0.04} />
      <KeySpot />
      <directionalLight position={[-2.2, 1.1, -2.2]} intensity={3.2} color="#8ec5ff" />
      <directionalLight position={[2.6, 0.7, -1.4]} intensity={1.8} color="#ffb070" />
      <directionalLight position={[0, 0.6, 3]} intensity={0.22} />
      <Environment resolution={256} environmentIntensity={0.7}>
        <color attach="background" args={['#030305']} />
        <Lightformer form="rect" intensity={7} position={[0, 3.2, 0.4]} rotation-x={Math.PI / 2} scale={[7, 0.35, 1]} />
        <Lightformer form="rect" intensity={4} position={[-3.5, 1.2, -1.5]} rotation-y={Math.PI / 2.6} scale={[0.25, 4, 1]} color="#a9d4ff" />
        <Lightformer form="rect" intensity={3} position={[3.5, 1.0, -1.2]} rotation-y={-Math.PI / 2.6} scale={[0.25, 4, 1]} color="#ffc28a" />
        <Lightformer form="rect" intensity={1.2} position={[0, 1.5, 4]} scale={[4, 1.2, 1]} />
      </Environment>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.0008, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#0d0e11" roughness={0.88} metalness={0} />
      </mesh>
    </>
  );
}

/** Bright seamless product-shot background. */
function BrightLighting() {
  return (
    <>
      <color attach="background" args={['#e7e9ed']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 4, 3]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <directionalLight position={[-3, 2, -2]} intensity={1.2} />
      <Environment resolution={256} environmentIntensity={1.4}>
        <color attach="background" args={['#f2f3f5']} />
        <Lightformer form="rect" intensity={3} position={[0, 5, 2]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>
    </>
  );
}

function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.3} />
      {/* key, fill and rim lights: readable shapes like a game weapon inspection screen */}
      <directionalLight position={[2.5, 4, 3]} intensity={2.8} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <directionalLight position={[-3, 1.5, 2.5]} intensity={0.8} color="#ffe6c8" />
      <directionalLight position={[-2, 3, -3]} intensity={1.8} color="#bcd7ff" />
      <Environment resolution={256} environmentIntensity={1.25}>
        <color attach="background" args={['#3b404b']} />
        <Lightformer form="rect" intensity={4} position={[0, 5, 3]} scale={[8, 2.5, 1]} />
        <Lightformer form="rect" intensity={2} position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[5, 3, 1]} />
        <Lightformer form="rect" intensity={2} position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[5, 3, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#9ed8ff" position={[0, 2, -7]} scale={4} />
        <Lightformer form="rect" intensity={0.7} position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
      </Environment>
    </>
  );
}

function SceneSwitch() {
  const look = useArsenal((s) => s.scene);
  if (look === 'dramatico')
    return (
      <>
        <DramaticLighting />
        <ContactShadows position={[0, -0.0005, 0]} opacity={0.85} scale={4} blur={1.6} far={1} resolution={1024} frames={Infinity} />
      </>
    );
  return (
    <>
      <color attach="background" args={[look === 'claro' ? '#e7e9ed' : '#343a45']} />
      {look === 'claro' ? <BrightLighting /> : <StudioLighting />}
      <ContactShadows position={[0, -0.001, 0]} opacity={look === 'claro' ? 0.45 : 0.55} scale={4} blur={2.4} far={1.5} resolution={512} frames={Infinity} />
    </>
  );
}

/** Registers the renderer/scene/camera so stills can be rendered at any resolution. */
function RenderBridgeProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const setFrameloop = useThree((s) => s.setFrameloop);
  useEffect(() => {
    bridge.current = { ...(bridge.current ?? {}), gl, scene, camera, setFrameloop };
    return () => {
      bridge.current = null;
    };
  }, [gl, scene, camera, setFrameloop]);
  return null;
}

/** Frames per second + triangle count, reported to the store twice a second. */
function StatsProbe() {
  const acc = useRef({ frames: 0, time: 0 });
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    acc.current.frames++;
    acc.current.time += dt;
    if (acc.current.time >= 0.5) {
      const fps = Math.round(acc.current.frames / acc.current.time);
      let tris = 0;
      exportRoot.current?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.visible) tris += (m.geometry.index ? m.geometry.index.count : (m.geometry.getAttribute('position')?.count ?? 0)) / 3;
      });
      const prev = useArsenal.getState().stats;
      if (prev.fps !== fps || prev.tris !== tris) useArsenal.getState().set({ stats: { fps, tris } });
      acc.current = { frames: 0, time: 0 };
    }
  });
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
  }, [gl]);
  return null;
}

export interface CameraApi {
  /** Orbit by angles (radians), used by the TV remote. */
  orbit(dTheta: number, dPhi: number): void;
  /** Multiply the camera distance. */
  zoom(factor: number): void;
  /** Re-frame the whole weapon. */
  frame(): void;
  /** Re-frame from a preset direction. */
  view(v: CameraView): void;
}

export type CameraView = 'persp' | 'side' | 'top' | 'front' | 'left';
const VIEW_DIRS: Record<CameraView, [number, number, number]> = {
  persp: [0.55, 0.32, 0.95],
  side: [0, 0.0001, 1],
  left: [0, 0.0001, -1],
  top: [0, 1, 0.0001],
  front: [1, 0.05, 0.0001],
};
let currentView: CameraView = 'persp';

/** Frames the weapon whenever the set of parts changes; exposes orbit/zoom for remote controls. */
const CameraRig = forwardRef<CameraApi, { autoRotate: boolean }>(function CameraRig({ autoRotate }, ref) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const parts = useArsenal((s) => s.parts);

  const frame = (dirOverride?: [number, number, number]) => {
    const root = exportRoot.current;
    const c = controls.current;
    if (!root || !c) return;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Exact fit: distance at which all 8 box corners are inside the view frustum (long guns fill the screen).
    const dir = new THREE.Vector3(...(dirOverride ?? VIEW_DIRS[currentView])).normalize();
    const fwd = dir.clone().negate();
    const upRef = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    camera.up.set(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, upRef).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    let dist = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const o = new THREE.Vector3(x, y, z).sub(sphere.center);
          const depth = o.dot(dir); // towards the camera
          dist = Math.max(dist, depth + Math.abs(o.dot(right)) / tanH, depth + Math.abs(o.dot(up)) / tanV);
        }
    dist *= 1.12;
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.near = sphere.radius / 100;
    camera.far = sphere.radius * 100;
    camera.updateProjectionMatrix();
    c.target.copy(sphere.center);
    c.minDistance = sphere.radius * 0.25;
    c.maxDistance = sphere.radius * 8;
    c.update();
  };

  useEffect(() => {
    // wait one frame so the meshes of the new parts exist
    const id = requestAnimationFrame(() => frame());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);

  useEffect(() => {
    if (!bridge.current) return;
    bridge.current.frameFor = (aspect: number, dir?: [number, number, number]) => {
      const c = controls.current;
      const pos = camera.position.clone();
      const quat = camera.quaternion.clone();
      const target = c?.target.clone();
      const prev = camera.aspect;
      camera.aspect = aspect;
      frame(dir);
      if (dir) {
        // orthographic-style views: look straight at the centre (top/bottom keep the muzzle to the right)
        const up = Math.abs(dir[1]) > 0.99 ? new THREE.Vector3(0, 0, dir[1] > 0 ? -1 : 1) : new THREE.Vector3(0, 1, 0);
        camera.up.copy(up);
        camera.lookAt(c?.target ?? new THREE.Vector3());
        camera.up.set(0, 1, 0);
      }
      camera.aspect = prev;
      return () => {
        camera.position.copy(pos);
        camera.quaternion.copy(quat);
        if (c && target) {
          c.target.copy(target);
          c.update();
        }
      };
    };
  });

  useImperativeHandle(ref, () => ({
    orbit(dTheta, dPhi) {
      const c = controls.current;
      if (!c) return;
      const off = camera.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta += dTheta;
      sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.05, Math.PI - 0.05);
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
      c.update();
    },
    zoom(factor) {
      const c = controls.current;
      if (!c) return;
      const off = camera.position.clone().sub(c.target).multiplyScalar(factor);
      const d = THREE.MathUtils.clamp(off.length(), c.minDistance, c.maxDistance);
      camera.position.copy(c.target).add(off.setLength(d));
      c.update();
    },
    frame,
    view(v) {
      currentView = v;
      frame();
    },
  }));

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} autoRotate={autoRotate} autoRotateSpeed={0.8} enablePan />;
});

/** Viewport: canvas + lighting + weapon + soft contact shadow + camera rig. */
export const ArsenalCanvas = forwardRef<CameraApi, { autoRotate: boolean }>(function ArsenalCanvas({ autoRotate }, ref) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ fov: 35, position: [1, 0.6, 1.6] }}
      onPointerMissed={() => useArsenal.getState().set({ selected: null })}
      data-testid="arsenal-canvas"
    >
      <SceneSwitch />
      <WeaponModel />
      <RenderBridgeProbe />
      <CameraRig ref={ref} autoRotate={autoRotate} />
      <StatsProbe />
    </Canvas>
  );
});
