import { Environment, GizmoHelper, GizmoViewport, Grid, Lightformer, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { parseAssetUri } from '@/core/assets/types';
import { edgePositions, kelvinToHex, objectGeometry } from '../geometry';
import { loadHdrAsset, loadModelAsset } from '../loaders';
import { applyMaps, applyParams } from '../materials';
import * as P from '../mesh/polyMesh';
import type { Material3D, Obj3D, Scene3DDoc } from '../model';
import * as ops from '../ops';
import { selectedVertexIds, selectEditObject, selectScene, useStudio3D } from '../store';

RectAreaLightUniformsLib.init();

/** Three objects by scene id (for the transform gizmo). */
const nodes = new Map<string, THREE.Object3D>();

// ---------------------------------------------------------------- materials

const MaterialsCtx = createContext<Map<string, THREE.MeshStandardMaterial>>(new Map());

function useMaterialInstances(defs: Material3D[]) {
  const [cache] = useState(() => new Map<string, THREE.MeshStandardMaterial>());
  const [, force] = useState(0);
  // Keep one THREE material per definition; update in place when the definition changes.
  useEffect(() => {
    const ids = new Set(defs.map((d) => d.id));
    for (const [id, m] of cache) if (!ids.has(id)) {
      m.dispose();
      cache.delete(id);
    }
    let alive = true;
    for (const def of defs) {
      let m = cache.get(def.id);
      if (!m) {
        m = new THREE.MeshStandardMaterial();
        cache.set(def.id, m);
      }
      applyParams(m, def);
      void applyMaps(m, def).then(() => alive && force((n) => n + 1));
    }
    force((n) => n + 1);
    return () => {
      alive = false;
    };
  }, [defs, cache]);
  return cache;
}

const fallbackMaterial = new THREE.MeshStandardMaterial({ color: '#b9bfcc', roughness: 0.5 });
const solidMaterial = new THREE.MeshStandardMaterial({ color: '#c8ccd6', roughness: 0.8, metalness: 0 });
const wireMaterial = new THREE.MeshBasicMaterial({ color: '#9fb3ff', wireframe: true });
const selectedEdgeMaterial = new THREE.LineBasicMaterial({ color: '#7c5cff', depthTest: false, transparent: true, opacity: 0.9 });

// ---------------------------------------------------------------- scene nodes

function SelectionEdges({ geometry }: { geometry: THREE.BufferGeometry }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry]);
  useEffect(() => () => edges.dispose(), [edges]);
  return <lineSegments geometry={edges} material={selectedEdgeMaterial} renderOrder={10} raycast={() => null} />;
}

function MeshNode({ o, selected, editing }: { o: Obj3D; selected: boolean; editing: boolean }) {
  const shading = useStudio3D((s) => s.shading);
  const mats = useContext(MaterialsCtx);
  const geometry = objectGeometry(o)!;
  const material = shading === 'wireframe' ? wireMaterial : shading === 'solid' ? solidMaterial : (o.materialId && mats.get(o.materialId)) || fallbackMaterial;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const st = useStudio3D.getState();
    if (st.mode === 'edit') {
      if (!editing) return;
      e.stopPropagation();
      if (st.editSel.mode !== 'face' || e.faceIndex == null) return;
      const fi = (geometry.userData.triToFace as Int32Array)[e.faceIndex];
      const cur = st.editSel.faces;
      st.setEditSel({ faces: e.shiftKey ? (cur.includes(fi) ? cur.filter((x) => x !== fi) : [...cur, fi]) : [fi] });
      return;
    }
    e.stopPropagation();
    if (o.locked) return;
    const sel = st.selection;
    st.select(e.shiftKey ? (sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id]) : [o.id]);
  };
  return (
    <>
      <mesh geometry={geometry} material={material} castShadow={o.castShadow} receiveShadow={o.receiveShadow} onClick={onClick} userData={{ objectId: o.id }} />
      {selected && !editing && <SelectionEdges geometry={geometry} />}
    </>
  );
}

function ModelNode({ o, selected }: { o: Obj3D; selected: boolean }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const [failed, setFailed] = useState(false);
  const shading = useStudio3D((s) => s.shading);
  useEffect(() => {
    const id = parseAssetUri(o.assetId);
    if (!id) return setFailed(true);
    let alive = true;
    loadModelAsset(id)
      .then((r) => alive && setObj(r.object.clone(true)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [o.assetId]);
  useEffect(() => {
    obj?.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.userData.original ??= m.material;
      m.material = shading === 'wireframe' ? wireMaterial : shading === 'solid' ? solidMaterial : m.userData.original;
      m.castShadow = o.castShadow;
      m.receiveShadow = o.receiveShadow;
    });
  }, [obj, shading, o.castShadow, o.receiveShadow]);
  const box = useMemo(() => (obj ? new THREE.Box3().setFromObject(obj) : null), [obj]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const st = useStudio3D.getState();
    if (st.mode === 'edit' || o.locked) return;
    e.stopPropagation();
    st.select(e.shiftKey ? [...new Set([...st.selection, o.id])] : [o.id]);
  };
  if (failed)
    return (
      <mesh onClick={onClick}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ef4444" wireframe />
      </mesh>
    );
  if (!obj) return null;
  return (
    <>
      <primitive object={obj} onClick={onClick} />
      {selected && box && <box3Helper args={[box, new THREE.Color('#7c5cff')]} />}
    </>
  );
}

function LightNode({ o, selected, shadows }: { o: Obj3D; selected: boolean; shadows: Scene3DDoc['environment']['shadows'] }) {
  const l = o.light!;
  const color = l.useTemperature ? kelvinToHex(l.temperature) : l.color;
  const cast = shadows.enabled && l.castShadow;
  const shadowProps = { 'shadow-mapSize': [shadows.mapSize, shadows.mapSize] as [number, number], 'shadow-bias': shadows.bias, 'shadow-radius': shadows.radius };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const st = useStudio3D.getState();
    if (st.mode === 'edit' || o.locked) return;
    e.stopPropagation();
    st.select([o.id]);
  };
  return (
    <>
      {l.kind === 'directional' && (
        <directionalLight color={color} intensity={l.intensity} castShadow={cast} {...shadowProps} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-camera-far={50} />
      )}
      {l.kind === 'point' && <pointLight color={color} intensity={l.intensity} distance={l.distance} decay={2} castShadow={cast} {...shadowProps} />}
      {l.kind === 'spot' && <spotLight color={color} intensity={l.intensity} distance={l.distance} angle={THREE.MathUtils.degToRad(l.angle)} penumbra={l.penumbra} decay={2} castShadow={cast} {...shadowProps} />}
      {l.kind === 'area' && <rectAreaLight color={color} intensity={l.intensity} width={l.width} height={l.height} />}
      {l.kind === 'hemisphere' && <hemisphereLight color={color} groundColor={l.groundColor} intensity={l.intensity} />}
      {/* clickable marker */}
      <mesh onClick={onClick} userData={{ objectId: o.id }}>
        {l.kind === 'area' ? <planeGeometry args={[l.width, l.height]} /> : <sphereGeometry args={[0.12, 12, 8]} />}
        <meshBasicMaterial color={selected ? '#7c5cff' : color} wireframe={l.kind === 'area'} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function ObjectNode({ id }: { id: string }) {
  const doc = useStudio3D(selectScene);
  const selected = useStudio3D((s) => s.selection.includes(id));
  const editObj = useStudio3D(selectEditObject);
  const o = doc.objects.find((x) => x.id === id);
  const kids = useMemo(() => doc.objects.filter((x) => x.parentId === id), [doc.objects, id]);
  if (!o) return null;
  return (
    <group
      ref={(g) => {
        if (g) nodes.set(id, g);
        else nodes.delete(id);
      }}
      position={o.position}
      rotation={o.rotation}
      scale={o.scale}
      visible={o.visible}
    >
      {o.type === 'mesh' && o.geometry && <MeshNode o={o} selected={selected} editing={editObj?.id === o.id} />}
      {o.type === 'model' && <ModelNode o={o} selected={selected} />}
      {o.type === 'light' && <LightNode o={o} selected={selected} shadows={doc.environment.shadows} />}
      {editObj?.id === o.id && editObj.geometry?.kind === 'mesh' && <EditOverlay o={editObj} />}
      {kids.map((k) => (
        <ObjectNode key={k.id} id={k.id} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- edit mode

const vertexMat = new THREE.PointsMaterial({ color: '#e5e7eb', size: 7, sizeAttenuation: false, depthTest: false, transparent: true });
const vertexSelMat = new THREE.PointsMaterial({ color: '#f59e0b', size: 9, sizeAttenuation: false, depthTest: false, transparent: true });
const edgeMat = new THREE.LineBasicMaterial({ color: '#111827', transparent: true, opacity: 0.85 });
const edgeSelMat = new THREE.LineBasicMaterial({ color: '#f59e0b', depthTest: false, transparent: true });
const faceSelMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false });

function EditOverlay({ o }: { o: Obj3D }) {
  const mesh = (o.geometry as { kind: 'mesh'; mesh: P.PolyMesh }).mesh;
  const sel = useStudio3D((s) => s.editSel);
  const gizmo = useStudio3D((s) => s.gizmo);
  const snap = useStudio3D((s) => s.snap);
  const pivot = useRef<THREE.Group>(null);
  const drag = useRef<{ base: P.PolyMesh; ids: number[]; center: P.Vec3; p0: THREE.Vector3; q0: THREE.Quaternion; s0: THREE.Vector3 } | null>(null);

  const points = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.v, 3));
    return g;
  }, [mesh]);
  const { lines, edgeList } = useMemo(() => {
    const { positions, edges } = edgePositions(mesh);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { lines: g, edgeList: edges };
  }, [mesh]);
  const selVerts = useMemo(() => selectedVertexIds(sel, mesh), [sel, mesh]);
  const selPoints = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(selVerts.flatMap((i) => P.vget(mesh, i)), 3));
    return g;
  }, [selVerts, mesh]);
  const selEdges = useMemo(() => {
    const segs = sel.mode === 'edge' ? sel.edges : [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs.flatMap(([a, b]) => [...P.vget(mesh, a), ...P.vget(mesh, b)]), 3));
    return g;
  }, [sel, mesh]);
  const selFaces = useMemo(() => {
    if (sel.mode !== 'face' || !sel.faces.length) return null;
    const sub: P.PolyMesh = { v: mesh.v, f: sel.faces.map((i) => mesh.f[i]).filter(Boolean) };
    const pos: number[] = [];
    for (const f of sub.f) for (let k = 1; k < f.length - 1; k++) for (const i of [f[0], f[k], f[k + 1]]) pos.push(...P.vget(mesh, i));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [sel, mesh]);
  useEffect(() => () => [points, lines, selPoints, selEdges].forEach((g) => g.dispose()), [points, lines, selPoints, selEdges]);

  const center = useMemo(() => P.centroid(mesh, selVerts), [mesh, selVerts]);
  useEffect(() => {
    if (pivot.current && !drag.current) {
      pivot.current.position.set(...center);
      pivot.current.quaternion.identity();
      pivot.current.scale.set(1, 1, 1);
    }
  }, [center]);

  const pick = (e: ThreeEvent<MouseEvent>, kind: 'vertex' | 'edge') => {
    const st = useStudio3D.getState();
    if (st.editSel.mode !== kind || e.index == null) return;
    e.stopPropagation();
    if (kind === 'vertex') {
      const i = e.index;
      const cur = st.editSel.vertices;
      st.setEditSel({ vertices: e.shiftKey ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]) : [i] });
    } else {
      const edge = edgeList[Math.floor(e.index / 2)];
      if (!edge) return;
      const same = (x: [number, number]) => x[0] === edge[0] && x[1] === edge[1];
      const cur = st.editSel.edges;
      st.setEditSel({ edges: e.shiftKey ? (cur.some(same) ? cur.filter((x) => !same(x)) : [...cur, edge]) : [edge] });
    }
  };

  return (
    <group>
      <lineSegments geometry={lines} material={edgeMat} onClick={(e) => pick(e, 'edge')} />
      <points geometry={points} material={vertexMat} onClick={(e) => pick(e, 'vertex')} />
      {selVerts.length > 0 && <points geometry={selPoints} material={vertexSelMat} raycast={() => null} />}
      {sel.mode === 'edge' && sel.edges.length > 0 && <lineSegments geometry={selEdges} material={edgeSelMat} raycast={() => null} />}
      {selFaces && <mesh geometry={selFaces} material={faceSelMat} raycast={() => null} />}
      <group ref={pivot} />
      {selVerts.length > 0 && pivot.current && (
        <TransformControls
          object={pivot.current}
          mode={gizmo}
          size={0.7}
          translationSnap={snap ? 0.25 : null}
          rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
          onMouseDown={() => {
            const pv = pivot.current!;
            drag.current = { base: mesh, ids: selVerts, center, p0: pv.position.clone(), q0: pv.quaternion.clone(), s0: pv.scale.clone() };
          }}
          onObjectChange={() => {
            const d = drag.current;
            const pv = pivot.current;
            if (!d || !pv) return;
            // Deltas relative to the start of this drag.
            const c = new THREE.Vector3(...d.center);
            const t = new THREE.Vector3().copy(pv.position).sub(d.p0);
            const q = pv.quaternion.clone().multiply(d.q0.clone().invert());
            const s = new THREE.Vector3(pv.scale.x / (d.s0.x || 1), pv.scale.y / (d.s0.y || 1), pv.scale.z / (d.s0.z || 1));
            const v = new THREE.Vector3();
            const moved = P.transformVertices(d.base, d.ids, (p) => v.set(...p).sub(c).multiply(s).applyQuaternion(q).add(c).add(t).toArray() as P.Vec3);
            useStudio3D.getState().live((doc) => ops.updateObjects(doc, [o.id], () => ({ geometry: { kind: 'mesh', mesh: moved } })));
          }}
          onMouseUp={() => {
            drag.current = null;
            useStudio3D.getState().endGesture();
          }}
        />
      )}
    </group>
  );
}

// ---------------------------------------------------------------- environment, camera, gizmo

function Lighting({ env }: { env: Scene3DDoc['environment'] }) {
  const { scene } = useThree();
  const [hdr, setHdr] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const id = env.preset === 'hdri' ? parseAssetUri(env.hdriAssetId) : null;
    if (!id) return setHdr(null);
    let alive = true;
    loadHdrAsset(id)
      .then((t) => alive && setHdr(t))
      .catch(() => alive && setHdr(null));
    return () => {
      alive = false;
    };
  }, [env.preset, env.hdriAssetId]);
  useEffect(() => {
    scene.background = env.backgroundMode === 'color' ? new THREE.Color(env.background) : env.backgroundMode === 'environment' && hdr ? hdr : null;
    scene.environment = hdr;
    scene.environmentIntensity = env.envIntensity;
    scene.backgroundIntensity = 1;
  }, [scene, env.backgroundMode, env.background, env.envIntensity, hdr]);

  const procedural = env.preset !== 'none' && env.preset !== 'hdri';
  const bgEnv = env.backgroundMode === 'environment' && procedural;
  return (
    <>
      <ambientLight intensity={env.ambient} />
      {procedural && (
        <Environment resolution={256} background={bgEnv} environmentIntensity={env.envIntensity}>
          {env.preset === 'studio' && (
            <>
              <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[6, 2, 1]} />
              <Lightformer form="rect" intensity={1.5} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
              <Lightformer form="rect" intensity={1.5} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
              <Lightformer form="ring" intensity={1} position={[0, 2, -6]} scale={3} />
            </>
          )}
          {env.preset === 'outdoor' && (
            <>
              <color attach="background" args={['#9cc7ff']} />
              <Lightformer form="circle" intensity={6} color="#fff3d6" position={[4, 6, 2]} scale={2} />
              <Lightformer form="rect" intensity={0.8} color="#6b8f5a" position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
            </>
          )}
          {env.preset === 'night' && (
            <>
              <color attach="background" args={['#0b1020']} />
              <Lightformer form="circle" intensity={2} color="#b8c7ff" position={[-4, 5, -3]} scale={1.2} />
              <Lightformer form="rect" intensity={0.4} color="#304070" position={[0, 3, 5]} scale={[8, 2, 1]} />
            </>
          )}
        </Environment>
      )}
    </>
  );
}

function CameraRig() {
  const cam = useStudio3D((s) => s.history.present.camera);
  const revision = useStudio3D((s) => s.cameraRevision);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...cam.position);
    if (controls) {
      controls.target.set(...cam.target);
      controls.update();
    } else camera.lookAt(...cam.target);
    // apply only on load / programmatic changes (view presets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, controls, camera, cam.orthographic]);
  return null;
}

function CaptureRegistrar() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const capture = async (opts: { transparent?: boolean; scale?: number } = {}) => {
      const bg = scene.background;
      const grid: THREE.Object3D[] = [];
      scene.traverse((o) => o.userData.helper && o.visible && (grid.push(o), (o.visible = false)));
      if (opts.transparent) scene.background = null;
      gl.setClearAlpha(opts.transparent ? 0 : 1);
      const ratio = gl.getPixelRatio();
      const hiRes = !!opts.scale && opts.scale > 1;
      // Higher resolution: re-render with more pixels instead of upscaling the image.
      if (hiRes) gl.setPixelRatio(ratio * opts.scale!);
      gl.render(scene, camera);
      const src = gl.domElement;
      let url: string;
      if (opts.scale && opts.scale < 1) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * opts.scale));
        c.height = Math.max(1, Math.round(src.height * opts.scale));
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        url = c.toDataURL('image/png');
      } else url = src.toDataURL('image/png');
      if (hiRes) gl.setPixelRatio(ratio);
      scene.background = bg;
      grid.forEach((o) => (o.visible = true));
      gl.setClearAlpha(1);
      gl.render(scene, camera);
      return url;
    };
    useStudio3D.getState().set({ capture });
    return () => useStudio3D.getState().set({ capture: null });
  }, [gl, scene, camera]);
  return null;
}

function ObjectGizmo() {
  const selection = useStudio3D((s) => s.selection);
  const mode = useStudio3D((s) => s.mode);
  const gizmo = useStudio3D((s) => s.gizmo);
  const space = useStudio3D((s) => s.space);
  const snap = useStudio3D((s) => s.snap);
  const doc = useStudio3D(selectScene);
  const id = selection.length === 1 ? selection[0] : null;
  const o = id ? doc.objects.find((x) => x.id === id) : undefined;
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    // wait one frame so the node ref is registered
    const r = requestAnimationFrame(() => setTarget(id ? nodes.get(id) ?? null : null));
    return () => cancelAnimationFrame(r);
  }, [id, doc]);
  if (mode !== 'object' || !o || o.locked || !target) return null;
  return (
    <TransformControls
      object={target}
      mode={gizmo}
      space={space}
      translationSnap={snap ? 0.25 : null}
      rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
      scaleSnap={snap ? 0.1 : null}
      onObjectChange={() => {
        const t = target;
        useStudio3D.getState().live((d) =>
          ops.updateObjects(d, [o.id], () => ({
            position: t.position.toArray() as P.Vec3,
            rotation: [t.rotation.x, t.rotation.y, t.rotation.z],
            scale: t.scale.toArray() as P.Vec3,
          })),
        );
      }}
      onMouseUp={() => useStudio3D.getState().endGesture()}
    />
  );
}

// ---------------------------------------------------------------- viewport

export function Viewport({ presenting = false }: { presenting?: boolean }) {
  const doc = useStudio3D(selectScene);
  const mats = useMaterialInstances(doc.materials);
  const roots = useMemo(() => doc.objects.filter((o) => !o.parentId), [doc.objects]);
  const env = doc.environment;
  const cam = doc.camera;
  const saveCamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsRef = useRef<{ target: THREE.Vector3; object: THREE.Camera } | null>(null);

  return (
    <Canvas
      shadows={env.shadows.enabled ? 'soft' : false}
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      dpr={[1, 2]}
      raycaster={{ params: { Points: { threshold: 0.08 }, Line: { threshold: 0.05 }, Mesh: {}, LOD: {}, Sprite: {} } }}
      onPointerMissed={(e) => {
        if (e.button !== 0) return;
        const st = useStudio3D.getState();
        if (st.mode === 'object') st.select([]);
      }}
      data-testid="viewport-3d"
    >
      {cam.orthographic ? <OrthographicCamera makeDefault position={cam.position} zoom={90} near={-1000} far={1000} /> : <PerspectiveCamera makeDefault position={cam.position} fov={cam.fov} near={0.05} far={2000} />}
      <OrbitControls
        ref={controlsRef as never}
        makeDefault
        enableDamping={false}
        autoRotate={presenting}
        autoRotateSpeed={1.2}
        onEnd={() => {
          const c = controlsRef.current;
          if (!c) return;
          if (saveCamTimer.current) clearTimeout(saveCamTimer.current);
          saveCamTimer.current = setTimeout(() => {
            useStudio3D.getState().setCamera({ position: c.object.position.toArray() as P.Vec3, target: c.target.toArray() as P.Vec3 });
          }, 300);
        }}
      />
      <CameraRig />
      <CaptureRegistrar />
      <Suspense fallback={null}>
        <Lighting env={env} />
      </Suspense>
      <MaterialsCtx.Provider value={mats}>
        {roots.map((o) => (
          <ObjectNode key={o.id} id={o.id} />
        ))}
      </MaterialsCtx.Provider>
      {!presenting && <ObjectGizmo />}
      {env.grid && !presenting && (
        <Grid infiniteGrid cellSize={0.5} sectionSize={2.5} cellColor="#3a4356" sectionColor="#5b6478" fadeDistance={40} position={[0, -0.001, 0]} userData={{ helper: true }} />
      )}
      {env.axes && !presenting && <axesHelper args={[1.5]} userData={{ helper: true }} />}
      {!presenting && (
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#f43f5e', '#22c55e', '#3b82f6']} labelColor="white" />
        </GizmoHelper>
      )}
    </Canvas>
  );
}
