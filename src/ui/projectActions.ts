import { exportProject, importProject, parseOmniText } from '@/core/projects/projectService';
import { useSettings } from '@/core/settings/settings';
import { downloadText, readFileAsText } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { toast } from './toast';

export async function exportProjectFile(id: string, name: string): Promise<void> {
  try {
    const file = await exportProject(id);
    downloadText(JSON.stringify(file), `${slugify(name, 'projeto')}.omni`, 'application/json');
    toast.success('Projeto exportado (.omni)');
  } catch (e) {
    toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : e}`);
  }
}

/** Import a .omni / .json workspace file chosen by the user. Returns the new project id. */
export async function importProjectFromFile(file: File): Promise<string | null> {
  const { maxImportSizeMB } = useSettings.getState().settings;
  if (file.size > maxImportSizeMB * 1024 * 1024) {
    toast.error(`Arquivo maior que o limite configurado (${maxImportSizeMB} MB)`);
    return null;
  }
  if (!/\.(omni|json)$/i.test(file.name)) {
    toast.error('Formato não suportado. Use arquivos .omni ou .json (ZIP de projetos chega na Fase 3).');
    return null;
  }
  try {
    const parsed = parseOmniText(await readFileAsText(file));
    if (!parsed.ok || !parsed.file) {
      toast.error(`Arquivo inválido: ${parsed.errors.join('; ')}`);
      return null;
    }
    const meta = await importProject(parsed.file);
    toast.success(`Projeto "${meta.name}" importado`);
    return meta.id;
  } catch (e) {
    toast.error(`Falha ao importar: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
