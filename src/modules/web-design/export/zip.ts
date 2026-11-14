export type ZipEntries = Record<string, string | Uint8Array>;

export async function zipFiles(files: ZipEntries, root = ''): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const base = root ? zip.folder(root)! : zip;
  for (const [path, content] of Object.entries(files)) base.file(path, content);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
