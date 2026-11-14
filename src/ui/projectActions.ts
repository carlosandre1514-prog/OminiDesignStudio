import { exportProject, importProject, parseOmniText } from '@/core/projects/projectService';
import { exportProjectZip, findMissingAssets, importProjectZip } from '@/core/projects/projectPackage';
import { useSettings } from '@/core/settings/settings';
import { blobToArrayBuffer } from '@/core/utils/binary';
import { downloadBlob, downloadText, readFileAsText } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { toast } from './toast';

export const PROJECT_ACCEPT = '.omni,.json,.zip,application/json,application/zip';

export async function exportProjectFile(id: string, name: string): Promise<void> {
  try {
    const file = await exportProject(id);
    downloadText(JSON.stringify(file), `${slugify(name, 'projeto')}.omni`, 'application/json');
    toast.success('Projeto exportado (.omni). Assets da biblioteca não são incluídos neste formato — use o pacote ZIP.');
  } catch (e) {
    toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : e}`);
  }
}

export async function exportProjectPackage(id: string, name: string): Promise<void> {
  try {
    downloadBlob(await exportProjectZip(id), `${slugify(name, 'projeto')}.zip`);
    toast.success('Pacote do projeto exportado (.zip com assets)');
  } catch (e) {
    toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : e}`);
  }
}

function reportMissing(missing: string[]) {
  if (missing.length)
    toast.error(`Dependências ausentes: ${missing.length} asset(s) referenciado(s) não estão na biblioteca. Importe-os ou use o pacote ZIP do projeto.`);
}

/** Import a .omni / .json workspace file or a project ZIP. Returns the new project id. */
export async function importProjectFromFile(file: File): Promise<string | null> {
  const { maxImportSizeMB } = useSettings.getState().settings;
  const max = maxImportSizeMB * 1024 * 1024;
  if (file.size > max) {
    toast.error(`Arquivo maior que o limite configurado (${maxImportSizeMB} MB)`);
    return null;
  }
  try {
    // Detect ZIP by content (PK\x03\x04), not only by extension.
    const head = new Uint8Array(await blobToArrayBuffer(file.slice(0, 4)));
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    if (isZip) {
      const res = await importProjectZip(file, max);
      toast.success(`Projeto "${res.project.name}" importado (${res.importedAssets} asset(s) novo(s), ${res.reusedAssets} reaproveitado(s))`);
      for (const e of res.errors) toast.error(e);
      reportMissing(res.missing);
      return res.project.id;
    }
    if (!/\.(omni|json)$/i.test(file.name) && head[0] !== 0x7b /* "{" */) {
      toast.error('Formato não suportado. Use .omni, .json ou .zip.');
      return null;
    }
    const parsed = parseOmniText(await readFileAsText(file));
    if (!parsed.ok || !parsed.file) {
      toast.error(`Arquivo inválido: ${parsed.errors.join('; ')}`);
      return null;
    }
    const meta = await importProject(parsed.file);
    toast.success(`Projeto "${meta.name}" importado`);
    reportMissing(await findMissingAssets(parsed.file.document.modules));
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
