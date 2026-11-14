import * as THREE from 'three';
import { parseAssetUri } from '@/core/assets/types';
import { kelvinToHex, objectGeometry } from './geometry';
import { loadModelAsset } from './loaders';
import { buildMaterial } from './materials';
import type { Obj3D, Scene3DDoc } from './model';

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'stl';

export interface ExportOptions {
  /** Only these objects (and descendants); all when omitted. */
  only?: string[];
  includeLights?: boolean;
  includeHidden?: boolean;
}

/** Build a plain THREE scene from the document (same geometry/material code as the viewport). */
export async function buildExportScene(doc: Scene3DDoc, opts: ExportOptions = {}): Promise<{ scene: THREE.Scene; warnings: string[] }> {
  const warnings: string[] = [];
  const scene = new THREE.Scene();
  scene.name = 'OmniDesign';
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  for (const def of doc.materials) mats.set(def.id, await buildMaterial(def));
  const fallback = await buildMaterial(undefined);
  const roots = opts.only ? new Set(opts.only) : null;

  const build = async (o: Obj3D, insideSelection: boolean): Promise<THREE.Object3D | null> => {
    if (!o.visible && !opts.includeHidden) return null;
    const included = insideSelection || !roots || roots.has(o.id);
    const node = new THREE.Group();
    node.name = o.name;
    node.position.set(...o.position);
    node.rotation.set(...o.rotation);
    node.scale.set(...o.scale);
    if (included) {
      if (o.type === 'mesh' && o.geometry) {
        const mesh = new THREE.Mesh(objectGeometry(o)!.clone(), (o.materialId && mats.get(o.materialId)) || fallback);
        mesh.name = o.name;
        mesh.castShadow = o.castShadow;
        mesh.receiveShadow = o.receiveShadow;
        node.add(mesh);
      }
      if (o.type === 'model') {
        try {
          node.add((await loadModelAsset(parseAssetUri(o.assetId) ?? '')).object.clone(true));
        } catch (e) {
          warnings.push(`Modelo "${o.name}" não pôde ser incluído: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (o.type === 'light' && opts.includeLights !== false && o.light) {
        const l = o.light;
        const color = l.useTemperature ? kelvinToHex(l.temperature) : l.color;
        let light: THREE.Light | null = null;
        if (l.kind === 'directional') light = new THREE.DirectionalLight(color, l.intensity);
        if (l.kind === 'point') light = new THREE.PointLight(color, l.intensity, l.distance);
        if (l.kind === 'spot') light = new THREE.SpotLight(color, l.intensity, l.distance, THREE.MathUtils.degToRad(l.angle), l.penumbra);
        if (light) {
          light.name = o.name;
          node.add(light);
        } else warnings.push(`"${o.name}": ${l.kind === 'area' ? 'luz de área' : 'luz hemisférica'} não é suportada pelo formato e foi omitida.`);
      }
    }
    for (const child of doc.objects.filter((c) => c.parentId === o.id)) {
      const c = await build(child, included);
      if (c) node.add(c);
    }
    // Drop empty branches outside the selection.
    return node.children.length || (included && o.type === 'group') ? node : null;
  };

  for (const o of doc.objects.filter((x) => !x.parentId)) {
    const n = await build(o, false);
    if (n) scene.add(n);
  }
  scene.updateMatrixWorld(true);
  return { scene, warnings };
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  warnings: string[];
}

export async function exportScene(doc: Scene3DDoc, format: ExportFormat, baseName: string, opts: ExportOptions = {}): Promise<ExportResult> {
  const { scene, warnings } = await buildExportScene(doc, { ...opts, includeLights: format === 'glb' || format === 'gltf' ? opts.includeLights : false });
  let meshes = 0;
  scene.traverse((o) => (o as THREE.Mesh).isMesh && meshes++);
  if (!meshes) throw new Error('Nada para exportar: a seleção não contém malhas visíveis.');
  switch (format) {
    case 'glb':
    case 'gltf': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const out = await new GLTFExporter().parseAsync(scene, { binary: format === 'glb', onlyVisible: !opts.includeHidden, maxTextureSize: 4096 });
      const blob =
        format === 'glb'
          ? new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' })
          : new Blob([JSON.stringify(out, null, 2)], { type: 'model/gltf+json' });
      return { blob, fileName: `${baseName}.${format}`, warnings };
    }
    case 'obj': {
      const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
      warnings.push('OBJ guarda geometria, UVs e normais; materiais e texturas não são incluídos (use GLB para isso).');
      return { blob: new Blob([new OBJExporter().parse(scene)], { type: 'model/obj' }), fileName: `${baseName}.obj`, warnings };
    }
    case 'stl': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
      warnings.push('STL guarda apenas a geometria (ideal para impressão 3D).');
      const data = new STLExporter().parse(scene, { binary: true }) as DataView;
      return { blob: new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }), fileName: `${baseName}.stl`, warnings };
    }
  }
}
