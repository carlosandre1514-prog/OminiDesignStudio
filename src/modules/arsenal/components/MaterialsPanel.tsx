import { useLiveQuery } from 'dexie-react-hooks';
import { Layers3, Palette, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createProject } from '@/core/projects/projectService';
import type { Slot } from '@/modules/studio-3d/weapons/catalog';
import { useShallow } from 'zustand/react/shallow';
import { FINISH_LABELS, type Finish } from '@/modules/studio-3d/weapons/textures';
import { CAMO_LABELS, CAMO_PALETTES } from '../lib/surface';
import type { CamoPattern } from '../lib/promptParser';
import { useArsenal } from '../store';
import { listTextureProjects, SLOT_LABELS } from '../lib/textureLink';
import { Btn, FOCUS, Section, Segmented, Slider, useProfile } from './ui';

const SWATCHES = ['#1d1f22', '#3a3d41', '#4e5634', '#9c8364', '#5a3a2a', '#2f3e55', '#7a1f1f', '#d8d8d2'];
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** PBR controls: roughness, metalness, edge wear, camouflage/cerakote, base finishes. */
export function MaterialsPanel() {
  const p = useProfile();
  const { finish, camo, edgeWear, roughness, metalness, parts } = useArsenal(useShallow((s) => ({ finish: s.finish, camo: s.camo, edgeWear: s.edgeWear, roughness: s.roughness, metalness: s.metalness, parts: s.parts })));
  const st = useArsenal.getState;
  const slots = new Set(parts.map((x) => x.slot));
  const relevant: Record<keyof typeof FINISH_LABELS, boolean> = {
    steel: slots.has('blade') || slots.has('metal'),
    coat: slots.has('anodized'),
    trim: slots.has('trim'),
    wood: slots.has('wood'),
    grip: slots.has('grip'),
    polymer: slots.has('polymer'),
    energy: slots.has('glow') || slots.has('crystal'),
  };
  return (
    <Section title="Materiais PBR" icon={<Palette size={16} />}>
      <Slider label="Rugosidade (Roughness)" value={roughness} min={0.2} max={1.6} step={0.05} format={pct} onChange={(v) => st().set({ roughness: v })} />
      <Slider label="Metálico (Metallic)" value={metalness} min={0} max={1.2} step={0.05} format={pct} onChange={(v) => st().set({ metalness: v })} />
      <Slider label="Desgaste de bordas (Edge Wear)" value={edgeWear} min={0} max={1} step={0.05} format={pct} onChange={(v) => st().set({ edgeWear: v })} />

      <Segmented<CamoPattern> label="Camuflagem / Cerakote" value={camo.pattern} options={(Object.keys(CAMO_LABELS) as CamoPattern[]).map((id) => ({ id, label: CAMO_LABELS[id] }))} onChange={(pattern) => st().set({ camo: { pattern, color: pattern in CAMO_PALETTES ? CAMO_PALETTES[pattern as keyof typeof CAMO_PALETTES][0] : camo.color } })} />
      {camo.pattern !== 'nenhum' && (
        <div>
          <div className={`mb-1 text-zinc-400 ${p === 'tv' ? 'text-base' : 'text-xs'}`}>Cor de camuflagem</div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cor de camuflagem">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={camo.color === c}
                onClick={() => st().set({ camo: { ...camo, color: c } })}
                className={`rounded-full border-2 ${camo.color === c ? 'border-cyan-300' : 'border-white/20'} ${p === 'tv' ? 'h-12 w-12' : p === 'mobile' ? 'h-10 w-10' : 'h-7 w-7'} ${FOCUS}`}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={camo.color} aria-label="Cor personalizada" onChange={(e) => st().set({ camo: { ...camo, color: e.target.value } })} className={`cursor-pointer rounded-lg border border-white/20 bg-transparent ${p === 'tv' ? 'h-12 w-16' : 'h-9 w-12'} ${FOCUS}`} />
          </div>
        </div>
      )}

      {(Object.keys(FINISH_LABELS) as (keyof typeof FINISH_LABELS)[])
        .filter((k) => relevant[k])
        .map((k) => {
          const def = FINISH_LABELS[k];
          return (
            <Segmented
              key={k}
              label={def.label}
              value={finish[k] as string}
              options={Object.entries(def.options).map(([id, label]) => ({ id, label: label as string }))}
              onChange={(v) => st().setFinish({ [k]: v } as Partial<Finish>)}
            />
          );
        })}
      <Slider label="Desgaste das texturas (arranhões, sujeira)" value={finish.wear} min={0} max={1} step={0.05} format={pct} onChange={(v) => st().setFinish({ wear: v })} />
    </Section>
  );
}

/**
 * Apply materials authored in the Texture Studio to the weapon's material slots
 * (receivers, polymer, steel, grip…). Textures tile at a real scale set by the slider.
 */
export function StudioTexturesPanel() {
  const navigate = useNavigate();
  const parts = useArsenal((s) => s.parts);
  const custom = useArsenal((s) => s.custom);
  const customScale = useArsenal((s) => s.customScale);
  const projects = useLiveQuery(() => listTextureProjects(), []) ?? [];
  const slots = [...new Set(parts.map((p) => p.slot))].filter((sl): sl is Slot => !!SLOT_LABELS[sl]);
  const st = useArsenal.getState;
  const newTexture = async () => {
    const { docFromPreset } = await import('@/modules/texture-studio/engine/presets');
    const meta = await createProject({ name: 'Textura para arma', category: '3d', modules: { 'texture-studio': docFromPreset('cerakote-black', 'Textura para arma') }, tags: ['textura'] });
    navigate(`/project/${meta.id}/texture-studio`);
  };
  return (
    <Section title="Texturas do Estúdio" icon={<Layers3 size={16} />} right={<Btn variant="ghost" onClick={newTexture} data-testid="arsenal-new-texture"><Plus size={14} /> Criar</Btn>}>
      {projects.length === 0 ? (
        <p className="text-xs text-zinc-400">Crie materiais no Estúdio de Texturas (camadas, pintura, gravações, desgaste) e aplique aqui em cada parte da arma.</p>
      ) : (
        <>
          {slots.map((slot) => (
            <Segmented
              key={slot}
              label={SLOT_LABELS[slot]!}
              value={custom[slot]?.id ?? ''}
              options={[{ id: '', label: 'Padrão' }, ...projects.map((p) => ({ id: p.id, label: p.name }))]}
              onChange={(id) => {
                const next = { ...st().custom };
                if (!id) delete next[slot];
                else next[slot] = { id, name: projects.find((p) => p.id === id)!.name };
                st().set({ custom: next });
              }}
            />
          ))}
          <Slider label="Escala da textura" value={customScale} min={2} max={40} step={1} format={(v) => `${Math.round(100 / v)} cm por repetição`} onChange={(v) => st().set({ customScale: v })} />
        </>
      )}
    </Section>
  );
}
