import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { getAsset } from '@/core/assets/assetService';
import { assetUri, parseAssetUri } from '@/core/assets/types';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { ColorField, NumField, Section, TextField } from '@/modules/web-design/components/fields';
import { toast } from '@/ui/toast';
import { kelvinToHex } from '../geometry';
import { MAP_LABELS } from '../materials';
import * as P from '../mesh/polyMesh';
import { PARAM_LABELS, PRIMITIVE_LABELS, type EnvPreset, type LightProps, type Material3D, type MaterialMaps, type Obj3D, type UVProjection } from '../model';
import * as ops from '../ops';
import { selectedVertexIds, selectEditObject, selectScene, useStudio3D, type EditSelectMode } from '../store';

const st = () => useStudio3D.getState();
const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;
const upd = (id: string, fn: (o: Obj3D) => Partial<Obj3D>) => st().apply((d) => ops.updateObjects(d, [id], fn));
const liveUpd = (id: string, fn: (o: Obj3D) => Partial<Obj3D>) => st().live((d) => ops.updateObjects(d, [id], fn));
const end = () => st().endGesture();

function Vec3Field({ label, value, onCommit, step = 0.1 }: { label: string; value: P.Vec3; onCommit: (v: P.Vec3) => void; step?: number }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {(['X', 'Y', 'Z'] as const).map((ax, i) => (
          <NumField key={ax} label={ax} value={Math.round(value[i] * 1000) / 1000} step={step} onCommit={(n) => onCommit(value.map((x, k) => (k === i ? n : x)) as P.Vec3)} />
        ))}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onLive, onEnd }: { label: string; value: number; min: number; max: number; step: number; onLive: (v: number) => void; onEnd: () => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-ink-400">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} className="min-w-0 flex-1" aria-label={label} onChange={(e) => onLive(Number(e.target.value))} onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd} />
      <span className="w-10 text-right tabular-nums">{Math.round(value * 100) / 100}</span>
    </label>
  );
}

// ---------------------------------------------------------------- material editor

function MapRow({ mat, k }: { mat: Material3D; k: keyof MaterialMaps }) {
  const projectId = useStudio3D((s) => s.projectId);
  const [picking, setPicking] = useState(false);
  const id = parseAssetUri(mat.maps[k]);
  const asset = useLiveQuery(() => (id ? getAsset(id) : Promise.resolve(undefined)), [id]);
  const set = (v: string | undefined) => st().apply((d) => ops.updateMaterial(d, mat.id, { maps: { [k]: v } }));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-ink-400">{MAP_LABELS[k]}</span>
      {id && asset?.thumbnail && <img src={asset.thumbnail} alt="" className="h-6 w-6 rounded object-cover" />}
      <button className="min-w-0 flex-1 truncate rounded border border-ink-700 px-2 py-1 text-left hover:bg-ink-800" onClick={() => setPicking(true)}>
        {id ? (asset ? asset.name : 'Ausente na biblioteca') : 'Escolher imagem…'}
      </button>
      {id && <button className="text-ink-400 hover:text-red-300" title="Remover mapa" onClick={() => set(undefined)}>✕</button>}
      {picking && <AssetPicker kinds={['image']} projectId={projectId} title={`Mapa: ${MAP_LABELS[k]}`} onClose={() => setPicking(false)} onPick={(a) => set(assetUri(a.id))} />}
    </div>
  );
}

function MaterialEditor({ mat }: { mat: Material3D }) {
  const set = (p: Partial<Material3D>) => st().apply((d) => ops.updateMaterial(d, mat.id, p));
  const live = (p: Partial<Material3D>) => st().live((d) => ops.updateMaterial(d, mat.id, p));
  return (
    <div className="space-y-2">
      <TextField label="Nome do material" value={mat.name} onCommit={(name) => set({ name: name || mat.name })} />
      <ColorField label="Cor base" value={mat.color} onLive={(color) => live({ color })} onEnd={end} onCommit={(color) => /^#[0-9a-f]{6}$/i.test(color) && set({ color })} />
      <Slider label="Metálico" value={mat.metalness} min={0} max={1} step={0.01} onLive={(metalness) => live({ metalness })} onEnd={end} />
      <Slider label="Rugosidade" value={mat.roughness} min={0} max={1} step={0.01} onLive={(roughness) => live({ roughness })} onEnd={end} />
      <Slider label="Opacidade" value={mat.opacity} min={0} max={1} step={0.01} onLive={(opacity) => live({ opacity })} onEnd={end} />
      <ColorField label="Emissivo" value={mat.emissive} onLive={(emissive) => live({ emissive })} onEnd={end} onCommit={(emissive) => /^#[0-9a-f]{6}$/i.test(emissive) && set({ emissive })} />
      <Slider label="Intens. emissiva" value={mat.emissiveIntensity} min={0} max={10} step={0.1} onLive={(emissiveIntensity) => live({ emissiveIntensity })} onEnd={end} />
      <div className="space-y-1.5 border-t border-ink-800 pt-2">
        <span className="label">Texturas (da Asset Library)</span>
        {(Object.keys(MAP_LABELS) as (keyof MaterialMaps)[]).map((k) => <MapRow key={k} mat={mat} k={k} />)}
      </div>
      {mat.maps.normalMap && <Slider label="Força da normal" value={mat.normalScale} min={0} max={3} step={0.05} onLive={(normalScale) => live({ normalScale })} onEnd={end} />}
      {mat.maps.aoMap && <Slider label="Força do AO" value={mat.aoIntensity} min={0} max={2} step={0.05} onLive={(aoIntensity) => live({ aoIntensity })} onEnd={end} />}
      <div className="space-y-1.5 border-t border-ink-800 pt-2">
        <span className="label">Mapeamento de textura (UV)</span>
        <div className="grid grid-cols-2 gap-1">
          <NumField label="U" title="Repetição U" value={mat.uvRepeat[0]} step={0.1} onCommit={(u) => set({ uvRepeat: [u, mat.uvRepeat[1]] })} />
          <NumField label="V" title="Repetição V" value={mat.uvRepeat[1]} step={0.1} onCommit={(v) => set({ uvRepeat: [mat.uvRepeat[0], v] })} />
          <NumField label="↔" title="Deslocamento U" value={mat.uvOffset[0]} step={0.05} onCommit={(u) => set({ uvOffset: [u, mat.uvOffset[1]] })} />
          <NumField label="↕" title="Deslocamento V" value={mat.uvOffset[1]} step={0.05} onCommit={(v) => set({ uvOffset: [mat.uvOffset[0], v] })} />
        </div>
        <NumField label="R°" title="Rotação da textura" value={mat.uvRotation} step={5} onCommit={(uvRotation) => set({ uvRotation })} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={mat.doubleSided} onChange={(e) => set({ doubleSided: e.target.checked })} /> Renderizar os dois lados
      </label>
    </div>
  );
}

function MaterialSection({ o }: { o: Obj3D }) {
  const doc = useStudio3D(selectScene);
  const mat = doc.materials.find((m) => m.id === o.materialId);
  return (
    <Section title="Material (PBR)">
      <div className="flex gap-1">
        <select className="input py-1 text-xs" aria-label="Material do objeto" value={o.materialId ?? ''} onChange={(e) => upd(o.id, () => ({ materialId: e.target.value || undefined }))}>
          <option value="">(padrão)</option>
          {doc.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button
          className="btn-ghost shrink-0 px-2 text-xs"
          title="Novo material para este objeto"
          onClick={() =>
            st().apply((d) => {
              const r = ops.addMaterial(d);
              return ops.updateObjects(r.doc, [o.id], () => ({ materialId: r.id }));
            })
          }
        >
          + Novo
        </button>
        {mat && (
          <button
            className="btn-ghost shrink-0 px-2 text-xs"
            title="Duplicar material (para variar sem afetar outros objetos)"
            onClick={() =>
              st().apply((d) => {
                const r = ops.duplicateMaterial(d, mat.id);
                return r.id ? ops.updateObjects(r.doc, [o.id], () => ({ materialId: r.id })) : r.doc;
              })
            }
          >
            ⧉
          </button>
        )}
      </div>
      {mat ? <MaterialEditor mat={mat} /> : <p className="text-[11px] text-ink-400">Sem material: cinza neutro.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- light

function LightSection({ o }: { o: Obj3D }) {
  const l = o.light!;
  const set = (p: Partial<LightProps>) => upd(o.id, (x) => ({ light: { ...x.light!, ...p } }));
  const live = (p: Partial<LightProps>) => liveUpd(o.id, (x) => ({ light: { ...x.light!, ...p } }));
  return (
    <Section title="Luz">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={l.useTemperature} onChange={(e) => set({ useTemperature: e.target.checked })} /> Usar temperatura de cor
      </label>
      {l.useTemperature ? (
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 shrink-0 rounded border border-ink-700" style={{ background: kelvinToHex(l.temperature) }} />
          <div className="flex-1">
            <Slider label="Temperatura (K)" value={l.temperature} min={1500} max={12000} step={100} onLive={(temperature) => live({ temperature })} onEnd={end} />
          </div>
        </div>
      ) : (
        <ColorField label="Cor" value={l.color} onLive={(color) => live({ color })} onEnd={end} onCommit={(color) => /^#[0-9a-f]{6}$/i.test(color) && set({ color })} />
      )}
      <Slider label="Intensidade" value={l.intensity} min={0} max={l.kind === 'point' || l.kind === 'spot' ? 200 : 20} step={0.1} onLive={(intensity) => live({ intensity })} onEnd={end} />
      {(l.kind === 'point' || l.kind === 'spot') && <NumField label="Dist" title="Alcance (0 = infinito)" value={l.distance} min={0} onCommit={(distance) => set({ distance })} />}
      {l.kind === 'spot' && (
        <>
          <Slider label="Ângulo (°)" value={l.angle} min={1} max={89} step={1} onLive={(angle) => live({ angle })} onEnd={end} />
          <Slider label="Suavidade" value={l.penumbra} min={0} max={1} step={0.01} onLive={(penumbra) => live({ penumbra })} onEnd={end} />
        </>
      )}
      {l.kind === 'area' && (
        <div className="grid grid-cols-2 gap-1">
          <NumField label="L" title="Largura" value={l.width} min={0.01} step={0.1} onCommit={(width) => set({ width })} />
          <NumField label="A" title="Altura" value={l.height} min={0.01} step={0.1} onCommit={(height) => set({ height })} />
        </div>
      )}
      {l.kind === 'hemisphere' && <ColorField label="Cor do solo" value={l.groundColor} onLive={(groundColor) => live({ groundColor })} onEnd={end} onCommit={(groundColor) => set({ groundColor })} />}
      {(l.kind === 'directional' || l.kind === 'point' || l.kind === 'spot') && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={l.castShadow} onChange={(e) => set({ castShadow: e.target.checked })} /> Projetar sombras
        </label>
      )}
      {(l.kind === 'directional' || l.kind === 'spot') && <p className="text-[11px] text-ink-400">Aponta para a origem da cena.</p>}
      {l.kind === 'area' && <p className="text-[11px] text-ink-400">Luz de área ilumina materiais PBR padrão; não projeta sombras.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- object

function ObjectSection({ o }: { o: Obj3D }) {
  const doc = useStudio3D(selectScene);
  const groups = doc.objects.filter((x) => x.type === 'group' && x.id !== o.id && !ops.descendants(doc, o.id).includes(x.id));
  return (
    <Section title={o.type === 'light' ? 'Objeto de luz' : o.type === 'group' ? 'Grupo' : o.type === 'model' ? 'Modelo importado' : 'Objeto'}>
      <TextField label="Nome" value={o.name} onCommit={(name) => upd(o.id, () => ({ name: name || o.name }))} />
      <Vec3Field label="Posição" value={o.position} onCommit={(position) => upd(o.id, () => ({ position }))} />
      <Vec3Field label="Rotação (graus)" step={5} value={o.rotation.map(deg) as P.Vec3} onCommit={(r) => upd(o.id, () => ({ rotation: r.map(rad) as P.Vec3 }))} />
      <Vec3Field label="Escala" value={o.scale} onCommit={(scale) => upd(o.id, () => ({ scale }))} />
      <label className="block">
        <span className="label">Dentro de</span>
        <select className="input py-1 text-xs" aria-label="Grupo pai" value={o.parentId ?? ''} onChange={(e) => st().apply((d) => ops.reparent(d, o.id, e.target.value || null))}>
          <option value="">(raiz da cena)</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.visible} onChange={(e) => upd(o.id, () => ({ visible: e.target.checked }))} /> Visível</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.locked} onChange={(e) => upd(o.id, () => ({ locked: e.target.checked }))} /> Bloqueado</label>
        {(o.type === 'mesh' || o.type === 'model') && (
          <>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.castShadow} onChange={(e) => upd(o.id, () => ({ castShadow: e.target.checked }))} /> Projeta sombra</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.receiveShadow} onChange={(e) => upd(o.id, () => ({ receiveShadow: e.target.checked }))} /> Recebe sombra</label>
          </>
        )}
      </div>
    </Section>
  );
}

function GeometrySection({ o }: { o: Obj3D }) {
  const g = o.geometry!;
  const mesh = g.kind === 'mesh' ? g.mesh : null;
  const s = mesh ? P.stats(mesh) : null;
  return (
    <Section title={g.kind === 'primitive' ? `Geometria: ${PRIMITIVE_LABELS[g.primitive]}` : 'Malha editável'}>
      {g.kind === 'primitive' ? (
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(g.params).map(([k, v]) => (
            <NumField
              key={k}
              label={k.slice(0, 2)}
              title={PARAM_LABELS[k] ?? k}
              value={v}
              step={/Segments|segments/.test(k) ? 1 : 0.1}
              min={/Segments|segments/.test(k) ? (k.startsWith('segments') ? 1 : 3) : k === 'radiusTop' ? 0 : 0.01}
              max={/Segments|segments/.test(k) ? 128 : 1000}
              onCommit={(n) => upd(o.id, (x) => ({ geometry: { ...(x.geometry as typeof g), params: { ...g.params, [k]: /Segments|segments/.test(k) ? Math.round(n) : n } } }))}
            />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-400">{s!.vertices} vértices · {s!.edges} arestas · {s!.faces} faces</p>
      )}
      <div className="grid grid-cols-2 gap-1">
        <select className="input py-1 text-xs" aria-label="Sombreamento" value={o.shading} onChange={(e) => upd(o.id, () => ({ shading: e.target.value as Obj3D['shading'] }))}>
          <option value="flat">Facetado</option>
          <option value="smooth">Suave</option>
          <option value="auto">Suavização automática</option>
        </select>
        <select className="input py-1 text-xs" aria-label="Projeção UV" value={o.uv} onChange={(e) => upd(o.id, () => ({ uv: e.target.value as UVProjection }))}>
          <option value="box">UV: caixa</option>
          <option value="planarXY">UV: plano XY</option>
          <option value="planarXZ">UV: plano XZ</option>
          <option value="planarYZ">UV: plano YZ</option>
          <option value="spherical">UV: esférica</option>
          <option value="cylindrical">UV: cilíndrica</option>
          <option value="atlas">UV: atlas (pintura 3D)</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button className="btn-outline text-xs" onClick={() => st().setMode('edit')}>Editar malha (Tab)</button>
        <button className="btn-outline text-xs" title="Incorpora rotação e escala nos vértices" onClick={() => st().apply((d) => ops.applyTransform(d, o.id))}>Aplicar transformação</button>
      </div>
    </Section>
  );
}

function ModifiersSection({ o }: { o: Obj3D }) {
  const m = o.modifiers;
  const set = (p: Partial<Obj3D['modifiers']>) => upd(o.id, (x) => ({ modifiers: { ...x.modifiers, ...p } }));
  return (
    <Section title="Modificadores (não destrutivos)">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-24 text-ink-400">Subdivisão</span>
        <select className="input py-1 text-xs" aria-label="Níveis de subdivisão" value={m.subdivision} onChange={(e) => set({ subdivision: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? 'Desligada' : `${n} nível(is)`}</option>)}
        </select>
      </div>
      {m.subdivision > 0 && (
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={m.smoothSubdivision} onChange={(e) => set({ smoothSubdivision: e.target.checked })} /> Suavizar (Catmull–Clark)</label>
      )}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-ink-400">Espelhar:</span>
        {(['x', 'y', 'z'] as const).map((ax) => (
          <label key={ax} className="flex items-center gap-1"><input type="checkbox" checked={m.mirror[ax]} onChange={(e) => set({ mirror: { ...m.mirror, [ax]: e.target.checked } })} /> {ax.toUpperCase()}</label>
        ))}
      </div>
      {(m.subdivision > 0 || m.mirror.x || m.mirror.y || m.mirror.z) && (
        <button className="btn-ghost w-full text-xs" title="Torna o resultado dos modificadores parte da malha" onClick={() => st().apply((d) => ops.convertToMesh(d, o.id, true))}>
          Aplicar modificadores na malha
        </button>
      )}
    </Section>
  );
}

function ModelSection({ o }: { o: Obj3D }) {
  const id = parseAssetUri(o.assetId);
  const asset = useLiveQuery(() => (id ? getAsset(id) : Promise.resolve(undefined)), [id]);
  return (
    <Section title="Arquivo">
      <p className="text-xs text-ink-300">{asset ? `${asset.name} (.${asset.ext})` : 'Modelo ausente na biblioteca'}</p>
      <p className="text-[11px] text-ink-400">Modelos importados mantêm materiais e hierarquia do arquivo. Mova, gire, escale e exporte normalmente.</p>
    </Section>
  );
}

// ---------------------------------------------------------------- selection actions

export function SelectionActions({ ids }: { ids: string[] }) {
  const doc = useStudio3D(selectScene);
  const [axis, setAxis] = useState<0 | 1 | 2>(0);
  const objs = ids.map((id) => ops.getObj(doc, id)).filter((o): o is Obj3D => !!o);
  const meshes = objs.filter((o) => o.type === 'mesh');
  const group = objs.length === 1 && objs[0].type === 'group' ? objs[0] : null;
  return (
    <Section title={ids.length > 1 ? `Seleção (${ids.length})` : 'Ações'}>
      <div className="grid grid-cols-2 gap-1">
        <button className="btn-outline text-xs" onClick={() => { let n: string[] = []; st().apply((d) => { const r = ops.duplicateObjects(d, ids); n = r.newIds; return r.doc; }); st().select(n); }}>Duplicar (Ctrl+D)</button>
        <button className="btn-outline text-xs" onClick={() => { st().apply((d) => ops.deleteObjects(d, ids)); st().select([]); }}>Excluir (Del)</button>
        {ids.length > 1 && <button className="btn-outline text-xs" onClick={() => { let g: string | undefined; st().apply((d) => { const r = ops.groupObjects(d, ids); g = r.groupId; return r.doc; }); if (g) st().select([g]); else toast.info('Selecione objetos do mesmo nível para agrupar.'); }}>Agrupar (Ctrl+G)</button>}
        {group && <button className="btn-outline text-xs" onClick={() => { let f: string[] = []; st().apply((d) => { const r = ops.ungroup(d, group.id); f = r.freed; return r.doc; }); st().select(f); }}>Desagrupar</button>}
        {meshes.length > 1 && <button className="btn-outline text-xs" title="Une as malhas em um único objeto" onClick={() => { let id: string | undefined; st().apply((d) => { const r = ops.joinMeshes(d, meshes.map((m) => m.id)); id = r.id; return r.doc; }); if (id) st().select([id]); }}>Unir malhas (Ctrl+J)</button>}
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-ink-400">Eixo</span>
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <button key={a} className="icon-btn h-7 w-8 text-xs" data-active={axis === i} onClick={() => setAxis(i as 0 | 1 | 2)}>{a}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button className="btn-ghost px-1 text-[11px]" title="Alinhar à origem do mundo" onClick={() => st().apply((d) => ops.alignObjects(d, ids, axis, 'origin'))}>Origem</button>
        <button className="btn-ghost px-1 text-[11px]" title="Alinhar pelos mínimos" onClick={() => st().apply((d) => ops.alignObjects(d, ids, axis, 'min'))}>Mín.</button>
        <button className="btn-ghost px-1 text-[11px]" title="Centralizar entre si" onClick={() => st().apply((d) => ops.alignObjects(d, ids, axis, 'center'))}>Centro</button>
        <button className="btn-ghost px-1 text-[11px]" title="Alinhar pelos máximos" onClick={() => st().apply((d) => ops.alignObjects(d, ids, axis, 'max'))}>Máx.</button>
        <button className="btn-ghost px-1 text-[11px]" title="Espelhar no eixo" onClick={() => st().apply((d) => ops.mirrorObjects(d, ids, axis))}>Espelhar</button>
        <button className="btn-ghost px-1 text-[11px]" title="Apoiar no chão (y = 0)" onClick={() => st().apply((d) => ops.alignObjects(d, ids, 1, 'ground'))}>No chão</button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- edit mode

export function EditPanel() {
  const o = useStudio3D(selectEditObject);
  const sel = useStudio3D((s) => s.editSel);
  const [dist, setDist] = useState(0.5);
  const [inset, setInset] = useState(0.25);
  const [bevelDepth, setBevelDepth] = useState(0.1);
  if (!o || o.geometry?.kind !== 'mesh') return null;
  const mesh = o.geometry.mesh;
  const s = P.stats(mesh);
  const verts = selectedVertexIds(sel, mesh);
  const faces = sel.faces;
  const needFaces = sel.mode !== 'face' || !faces.length;
  const modeBtn = (m: EditSelectMode, label: string, key: string) => (
    <button className="icon-btn h-8 w-full text-xs" data-active={sel.mode === m} title={`${label} (${key})`} onClick={() => st().setEditSel({ mode: m, vertices: [], edges: [], faces: [] })}>
      {label}
    </button>
  );
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <Section title="Modo de edição">
        <div className="grid grid-cols-3 gap-1">
          {modeBtn('vertex', 'Vértices', '1')}
          {modeBtn('edge', 'Arestas', '2')}
          {modeBtn('face', 'Faces', '3')}
        </div>
        <p className="text-[11px] text-ink-400">
          {s.vertices} vértices · {s.edges} arestas · {s.faces} faces — selecionado: {sel.mode === 'face' ? `${faces.length} face(s)` : sel.mode === 'edge' ? `${sel.edges.length} aresta(s)` : `${sel.vertices.length} vértice(s)`}
        </p>
        <p className="text-[11px] text-ink-400">Clique para selecionar, Shift para somar. Use o gizmo para mover/girar/escalar a seleção (W/E/R).</p>
        <div className="grid grid-cols-2 gap-1">
          <button className="btn-ghost text-xs" onClick={() => st().setEditSel(sel.mode === 'face' ? { faces: mesh.f.map((_, i) => i) } : sel.mode === 'edge' ? { edges: P.edges(mesh).map((e) => [e.a, e.b] as [number, number]) } : { vertices: Array.from({ length: s.vertices }, (_, i) => i) })}>Selecionar tudo (A)</button>
          <button className="btn-ghost text-xs" onClick={() => st().setEditSel({ vertices: [], edges: [], faces: [] })}>Limpar seleção</button>
        </div>
      </Section>
      <Section title="Ferramentas de modelagem">
        <div className="flex items-end gap-1">
          <div className="flex-1"><NumField label="d" title="Distância da extrusão" value={dist} step={0.1} onCommit={setDist} /></div>
          <button className="btn-outline text-xs" disabled={needFaces} title="Extrudar faces selecionadas (E)" onClick={() => run(() => st().editMesh((m) => { const r = P.extrudeFaces(m, faces, dist); return { mesh: r.mesh, select: { faces: r.faces } }; }))}>Extrudar</button>
        </div>
        <div className="flex items-end gap-1">
          <div className="flex-1"><NumField label="%" title="Quanto recuar (0–0,95)" value={inset} min={0.01} max={0.95} step={0.05} onCommit={setInset} /></div>
          <button className="btn-outline text-xs" disabled={needFaces} title="Inset (I)" onClick={() => run(() => st().editMesh((m) => { const r = P.insetFaces(m, faces, inset); return { mesh: r.mesh, select: { faces: r.faces } }; }))}>Inset</button>
        </div>
        <div className="flex items-end gap-1">
          <div className="flex-1"><NumField label="h" title="Profundidade do bevel (negativo afunda)" value={bevelDepth} step={0.05} onCommit={setBevelDepth} /></div>
          <button className="btn-outline text-xs" disabled={needFaces} title="Bevel de faces (inset + altura)" onClick={() => run(() => st().editMesh((m) => { const r = P.bevelFaces(m, faces, inset, bevelDepth); return { mesh: r.mesh, select: { faces: r.faces } }; }))}>Bevel</button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button className="btn-outline text-xs" disabled={sel.mode !== 'edge' || sel.edges.length !== 1} title="Loop cut: selecione uma aresta de um anel de quads" onClick={() => run(() => st().editMesh((m) => { const [a, b] = sel.edges[0]; const r = P.loopCut(m, a, b); if (!r.newVertices.length) throw new Error('Loop cut precisa de uma aresta entre faces de 4 lados.'); return { mesh: r.mesh, select: { mode: 'vertex', vertices: r.newVertices } }; }))}>Loop cut</button>
          <button className="btn-outline text-xs" title="Subdividir a malha (Catmull–Clark)" onClick={() => run(() => st().editMesh((m) => P.subdivide(m, true)))}>Subdividir</button>
          <button className="btn-outline text-xs" title="Subdividir sem suavizar" onClick={() => run(() => st().editMesh((m) => P.subdivide(m, false)))}>Subdividir (plano)</button>
          <button className="btn-outline text-xs" title="Unir vértices sobrepostos" onClick={() => run(() => st().editMesh((m) => P.mergeByDistance(m, 1e-3)))}>Mesclar próximos</button>
          <button className="btn-outline text-xs" disabled={needFaces} title="Inverter normais das faces" onClick={() => run(() => st().editMesh((m) => P.flipFaces(m, faces)))}>Inverter normais</button>
          <button className="btn-outline text-xs" disabled={sel.mode === 'face' ? !faces.length : !verts.length} title="Excluir seleção (Del)" onClick={() => run(() => st().editMesh((m) => (sel.mode === 'face' ? P.deleteFaces(m, faces) : P.deleteVertices(m, verts))))}>Excluir</button>
          <button
            className="btn-outline col-span-2 text-xs"
            disabled={needFaces}
            title="Mover faces selecionadas para um novo objeto"
            onClick={() => {
              let nid: string | undefined;
              st().apply((d) => { const r = ops.separateFaces(d, o.id, faces); nid = r.newId; return r.doc; });
              if (!nid) return toast.info('Selecione algumas faces (não todas) para separar.');
              st().setMode('object');
              st().select([nid]);
            }}
          >
            Separar seleção em novo objeto
          </button>
        </div>
      </Section>
      <Section title="">
        <button className="btn-primary w-full text-xs" onClick={() => st().setMode('object')}>Voltar ao modo objeto (Tab)</button>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- scene settings

function SceneSettings() {
  const doc = useStudio3D(selectScene);
  const projectId = useStudio3D((s) => s.projectId);
  const [hdriPick, setHdriPick] = useState(false);
  const env = doc.environment;
  const setEnv = (p: Partial<typeof env>) => st().apply((d) => ({ ...d, environment: { ...d.environment, ...p } }));
  const liveEnv = (p: Partial<typeof env>) => st().live((d) => ({ ...d, environment: { ...d.environment, ...p } }));
  const hdriId = parseAssetUri(env.hdriAssetId);
  const hdri = useLiveQuery(() => (hdriId ? getAsset(hdriId) : Promise.resolve(undefined)), [hdriId]);
  return (
    <>
      <Section title="Ambiente e iluminação global">
        <select className="input py-1 text-xs" aria-label="Ambiente" value={env.preset} onChange={(e) => setEnv({ preset: e.target.value as EnvPreset })}>
          <option value="none">Sem ambiente</option>
          <option value="studio">Estúdio</option>
          <option value="outdoor">Ar livre</option>
          <option value="night">Noite</option>
          <option value="hdri">HDRI da biblioteca…</option>
        </select>
        {env.preset === 'hdri' && (
          <button className="btn-outline w-full text-xs" onClick={() => setHdriPick(true)}>{hdri ? `HDRI: ${hdri.name}` : hdriId ? 'HDRI ausente — escolher outro' : 'Escolher/importar arquivo .hdr…'}</button>
        )}
        <Slider label="Intens. ambiente" value={env.envIntensity} min={0} max={3} step={0.05} onLive={(envIntensity) => liveEnv({ envIntensity })} onEnd={end} />
        <Slider label="Luz ambiente" value={env.ambient} min={0} max={2} step={0.05} onLive={(ambient) => liveEnv({ ambient })} onEnd={end} />
        <select className="input py-1 text-xs" aria-label="Fundo" value={env.backgroundMode} onChange={(e) => setEnv({ backgroundMode: e.target.value as typeof env.backgroundMode })}>
          <option value="color">Fundo: cor sólida</option>
          <option value="environment">Fundo: ambiente</option>
          <option value="transparent">Fundo: transparente</option>
        </select>
        {env.backgroundMode === 'color' && <ColorField label="Cor de fundo" value={env.background} onLive={(background) => liveEnv({ background })} onEnd={end} onCommit={(background) => /^#[0-9a-f]{6}$/i.test(background) && setEnv({ background })} />}
      </Section>
      <Section title="Sombras">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={env.shadows.enabled} onChange={(e) => setEnv({ shadows: { ...env.shadows, enabled: e.target.checked } })} /> Sombras ativadas</label>
        {env.shadows.enabled && (
          <>
            <select className="input py-1 text-xs" aria-label="Qualidade das sombras" value={env.shadows.mapSize} onChange={(e) => setEnv({ shadows: { ...env.shadows, mapSize: Number(e.target.value) } })}>
              <option value={512}>Qualidade: baixa (512)</option>
              <option value={1024}>Qualidade: média (1024)</option>
              <option value={2048}>Qualidade: alta (2048)</option>
              <option value={4096}>Qualidade: máxima (4096)</option>
            </select>
            <Slider label="Suavidade" value={env.shadows.radius} min={0} max={10} step={0.5} onLive={(radius) => liveEnv({ shadows: { ...env.shadows, radius } })} onEnd={end} />
          </>
        )}
      </Section>
      <Section title="Viewport">
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={env.grid} onChange={(e) => setEnv({ grid: e.target.checked })} /> Grid</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={env.axes} onChange={(e) => setEnv({ axes: e.target.checked })} /> Eixos</label>
        </div>
        {!doc.camera.orthographic && <Slider label="Campo de visão" value={doc.camera.fov} min={15} max={100} step={1} onLive={(fov) => st().setCamera({ fov })} onEnd={() => undefined} />}
        <p className="text-[11px] text-ink-400">Clique em um objeto para editá-lo. Arraste para orbitar, botão direito para mover, roda para zoom.</p>
      </Section>
      <Section title={`Materiais (${doc.materials.length})`}>
        <ul className="space-y-1">
          {doc.materials.map((m) => {
            const uses = doc.objects.filter((o) => o.materialId === m.id).length;
            return (
              <li key={m.id} className="flex items-center gap-2 text-xs">
                <span className="h-4 w-4 shrink-0 rounded border border-ink-700" style={{ background: m.color }} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="text-ink-400">{uses}</span>
                <button className="text-ink-400 hover:text-red-300" title="Excluir material" onClick={() => (uses === 0 || confirm(`"${m.name}" é usado por ${uses} objeto(s). Excluir?`)) && st().apply((d) => ops.deleteMaterial(d, m.id))}>✕</button>
              </li>
            );
          })}
        </ul>
        <button className="btn-ghost w-full text-xs" onClick={() => st().apply((d) => ops.addMaterial(d).doc)}>+ Novo material</button>
      </Section>
      {hdriPick && <AssetPicker kinds={['hdri']} projectId={projectId} title="Ambiente HDRI" onClose={() => setHdriPick(false)} onPick={(a) => setEnv({ hdriAssetId: assetUri(a.id), preset: 'hdri' })} />}
    </>
  );
}

export function Inspector() {
  const doc = useStudio3D(selectScene);
  const selection = useStudio3D((s) => s.selection);
  const mode = useStudio3D((s) => s.mode);
  if (mode === 'edit') return <EditPanel />;
  const objs = selection.map((id) => ops.getObj(doc, id)).filter((o): o is Obj3D => !!o);
  if (!objs.length) return <SceneSettings />;
  if (objs.length > 1) return <SelectionActions ids={objs.map((o) => o.id)} />;
  const o = objs[0];
  return (
    <>
      <ObjectSection o={o} />
      {o.type === 'mesh' && o.geometry && <GeometrySection o={o} />}
      {o.type === 'mesh' && o.geometry && <ModifiersSection o={o} />}
      {o.type === 'mesh' && <MaterialSection o={o} />}
      {o.type === 'light' && <LightSection o={o} />}
      {o.type === 'model' && <ModelSection o={o} />}
      <SelectionActions ids={[o.id]} />
    </>
  );
}
