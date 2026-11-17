import { Box, Download, FileBox, Loader2, Shapes } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadBlob } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { toast } from '@/ui/toast';
import { exportRoot } from '../canvas/WeaponModel';
import { exportWeapon, sendToStudio, type ExportFormat } from '../lib/exportWeapon';
import { useArsenal, weaponById } from '../store';
import { Btn, useProfile } from './ui';

const FORMATS: { id: ExportFormat; label: string; icon: typeof Box; title: string }[] = [
  { id: 'glb', label: '.GLB', icon: Box, title: 'GLB — arquivo único com peças, materiais PBR e texturas' },
  { id: 'gltf', label: '.GLTF', icon: FileBox, title: 'GLTF — JSON com texturas embutidas' },
  { id: 'obj', label: '.OBJ', icon: Shapes, title: 'OBJ — geometria, normais e UVs' },
];

/** Download the weapon (visible parts, as shown) or open it in the full 3D studio. */
export function ExportBar({ compact = false }: { compact?: boolean }) {
  const p = useProfile();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const base = () => {
    const s = useArsenal.getState();
    return slugify(s.source === 'image' ? `silhueta-${s.imageName.replace(/\.[^.]+$/, '')}` : weaponById(s.weaponId).name, 'arma');
  };

  const run = async (fmt: ExportFormat) => {
    if (!exportRoot.current) return;
    setBusy(fmt);
    try {
      const r = await exportWeapon(exportRoot.current, fmt, base());
      downloadBlob(r.blob, r.fileName);
      toast.success(`${r.fileName} exportado (${(r.blob.size / 1024).toFixed(0)} KB)`);
    } catch (e) {
      toast.error(`Falha na exportação: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  const toStudio = async () => {
    setBusy('studio');
    try {
      const s = useArsenal.getState();
      const name = s.source === 'image' ? `Silhueta ${s.imageName}` : weaponById(s.weaponId).name;
      // An extruded silhouette is laid out like a firearm (along X).
      const weapon = s.source === 'image' ? { ...weaponById('pistol'), name } : weaponById(s.weaponId);
      const id = await sendToStudio(weapon, s.parts, { ...s.finish }, s.camo, `${name} (Arsenal)`, s.custom);
      toast.success('Projeto 3D criado com a arma');
      navigate(`/project/${id}/3d-studio`);
    } catch (e) {
      toast.error(`Não foi possível abrir no estúdio: ${e instanceof Error ? e.message : e}`);
      setBusy(null);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'border-t border-white/10 bg-[#0b0e13]/95 px-3 py-2'} ${p === 'tv' ? 'gap-3 px-6 py-3' : ''}`} role="toolbar" aria-label="Exportação" data-testid="arsenal-export">
      <span className={`mr-1 flex items-center gap-1 text-zinc-400 ${p === 'tv' ? 'text-base' : 'text-xs'}`}>
        <Download size={14} /> Exportar
      </span>
      {FORMATS.map(({ id, label, icon: Icon, title }) => (
        <Btn key={id} onClick={() => run(id)} disabled={!!busy} title={title} aria-label={`Exportar ${label}`} data-testid={`arsenal-export-${id}`}>
          {busy === id ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />} {label}
        </Btn>
      ))}
      <Btn variant="ghost" onClick={toStudio} disabled={!!busy} title="Cria um projeto 3D editável com a arma" data-testid="arsenal-to-studio">
        {busy === 'studio' ? <Loader2 className="animate-spin" size={16} /> : <Box size={16} />} Abrir no Estúdio 3D
      </Btn>
    </div>
  );
}
