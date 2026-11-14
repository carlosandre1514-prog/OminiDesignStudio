import { lazy, Suspense, useState } from 'react';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { toast } from '@/ui/toast';
import { createGroup, createLight, createModel, createPrimitive, LIGHT_LABELS, PRIMITIVE_LABELS, type LightKind, type Obj3D, type Primitive } from '../model';
import * as ops from '../ops';
import { selectScene, useStudio3D } from '../store';

const WeaponGenerator = lazy(() => import('./WeaponGenerator').then((m) => ({ default: m.WeaponGenerator })));

const ICON: Record<Obj3D['type'], string> = { mesh: '◆', group: '▣', light: '☀', model: '⬢' };
const st = () => useStudio3D.getState();

export function addObject(o: Obj3D) {
  const s = st();
  const doc = s.history.present;
  // New objects use the first material when there is one.
  if (o.type === 'mesh' && !o.materialId) o.materialId = doc.materials[0]?.id;
  // Place new meshes/models next to existing ones instead of inside them.
  if (o.type === 'mesh' || o.type === 'model') {
    const isGroundPlane = (x: Obj3D) => x.geometry?.kind === 'primitive' && x.geometry.primitive === 'plane';
    const others = doc.objects.filter((x) => (x.type === 'mesh' || x.type === 'model') && !isGroundPlane(x));
    const boxes = others.map((x) => ops.worldBox(doc, x.id));
    for (let i = 0; i < 12; i++) {
      const probe = ops.worldBox(ops.addObjects(doc, [o]), o.id);
      if (!boxes.some((b) => b.intersectsBox(probe))) break;
      o.position = [o.position[0] + 1.5, o.position[1], o.position[2]];
    }
  }
  s.apply((d) => ops.addObjects(d, [o]));
  s.select([o.id]);
}

function Row({ o, depth }: { o: Obj3D; depth: number }) {
  const doc = useStudio3D(selectScene);
  const selected = useStudio3D((s) => s.selection.includes(o.id));
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const kids = doc.objects.filter((x) => x.parentId === o.id);
  const toggle = (k: 'visible' | 'locked') => st().apply((d) => ops.updateObjects(d, [o.id], (x) => ({ [k]: !x[k] })));
  return (
    <>
      <li
        className={`group flex items-center gap-1 rounded py-0.5 pr-1 text-xs ${selected ? 'bg-accent-500/20 text-ink-100' : 'text-ink-300 hover:bg-ink-800'}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {kids.length ? (
          <button className="w-3 text-ink-400" onClick={() => setOpen(!open)} aria-label={open ? 'Recolher' : 'Expandir'}>{open ? '▾' : '▸'}</button>
        ) : (
          <span className="w-3" />
        )}
        <span className="w-4 text-center text-ink-400">{ICON[o.type]}</span>
        {renaming ? (
          <input
            className="input py-0 text-xs"
            autoFocus
            defaultValue={o.name}
            onBlur={(e) => {
              const name = e.target.value.trim() || o.name;
              st().apply((d) => ops.updateObjects(d, [o.id], () => ({ name })));
              setRenaming(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button
            className={`min-w-0 flex-1 truncate py-0.5 text-left ${o.visible ? '' : 'opacity-40'}`}
            onClick={(e) => {
              if (st().mode === 'edit') return;
              const cur = st().selection;
              st().select(e.shiftKey || e.ctrlKey || e.metaKey ? (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : [o.id]);
            }}
            onDoubleClick={() => setRenaming(true)}
          >
            {o.name}
          </button>
        )}
        <button className={`w-4 ${o.locked ? 'text-amber-400' : 'text-ink-400 opacity-0 group-hover:opacity-100'}`} title={o.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => toggle('locked')}>
          {o.locked ? '🔒' : '🔓'}
        </button>
        <button className={`w-4 ${o.visible ? 'text-ink-400 opacity-0 group-hover:opacity-100' : 'text-ink-100'}`} title={o.visible ? 'Ocultar' : 'Mostrar'} onClick={() => toggle('visible')}>
          {o.visible ? '👁' : '—'}
        </button>
      </li>
      {open && kids.map((k) => <Row key={k.id} o={k} depth={depth + 1} />)}
    </>
  );
}

export function Outliner() {
  const doc = useStudio3D(selectScene);
  const projectId = useStudio3D((s) => s.projectId);
  const [picking, setPicking] = useState(false);
  const [weapons, setWeapons] = useState(false);
  const roots = doc.objects.filter((o) => !o.parentId);
  return (
    <div className="flex h-full flex-col">
      <section className="border-b border-ink-800 p-3">
        <div className="section-title mb-2">Adicionar</div>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(PRIMITIVE_LABELS) as Primitive[]).map((p) => (
            <button key={p} className="rounded px-1 py-1.5 text-[11px] text-ink-300 hover:bg-ink-800 hover:text-ink-100" title={`Adicionar ${PRIMITIVE_LABELS[p]}`} onClick={() => addObject(createPrimitive(p))}>
              {PRIMITIVE_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <select
            className="input py-1 text-[11px]"
            aria-label="Adicionar luz"
            value=""
            onChange={(e) => e.target.value && addObject(createLight(e.target.value as LightKind))}
          >
            <option value="">+ Luz…</option>
            {(Object.keys(LIGHT_LABELS) as LightKind[]).map((k) => <option key={k} value={k}>{LIGHT_LABELS[k]}</option>)}
          </select>
          <button className="rounded px-1 py-1 text-[11px] text-ink-300 hover:bg-ink-800" onClick={() => addObject(createGroup())}>+ Grupo vazio</button>
        </div>
        <button className="btn-primary mt-2 w-full text-xs" onClick={() => setWeapons(true)} data-testid="open-weapon-generator">⚔ Gerador de armas 3D</button>
        <button className="btn-outline mt-1 w-full text-xs" onClick={() => setPicking(true)}>Importar modelo 3D…</button>
        <p className="mt-1 text-[10px] leading-snug text-ink-400">GLB, GLTF, OBJ (+MTL), FBX e STL — ficam salvos na Asset Library.</p>
      </section>
      <section className="flex min-h-0 flex-1 flex-col p-3">
        <div className="section-title mb-2">Hierarquia ({doc.objects.length})</div>
        <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="outliner">
          {roots.map((o) => <Row key={o.id} o={o} depth={0} />)}
        </ul>
      </section>
      {weapons && (
        <Suspense fallback={null}>
          <WeaponGenerator onClose={() => setWeapons(false)} />
        </Suspense>
      )}
      {picking && (
        <AssetPicker
          kinds={['model3d']}
          projectId={projectId}
          title="Importar modelo 3D"
          onClose={() => setPicking(false)}
          onPick={async (a) => {
            if (a.ext === 'mtl') return toast.info('Arquivos .mtl são materiais: importe o .obj correspondente.');
            const { loadModelAsset } = await import('../loaders');
            try {
              const r = await loadModelAsset(a.id);
              r.warnings.forEach((w) => toast.info(w));
              addObject(createModel(a.id, a.name));
              toast.success(`"${a.name}" adicionado à cena`);
            } catch (e) {
              toast.error(`Não foi possível abrir o modelo: ${e instanceof Error ? e.message : e}`);
            }
          }}
        />
      )}
    </div>
  );
}
