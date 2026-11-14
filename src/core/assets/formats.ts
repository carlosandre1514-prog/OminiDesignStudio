import type { AssetCategory, AssetKind } from './types';

export interface FormatInfo {
  ext: string;
  mime: string;
  kind: AssetKind;
  category: AssetCategory;
  label: string;
}

/** Supported import formats (blueprint §9). 3D files are stored now and previewed in Phase 4. */
export const FORMATS: Record<string, FormatInfo> = {
  png: { ext: 'png', mime: 'image/png', kind: 'image', category: 'images', label: 'PNG' },
  jpg: { ext: 'jpg', mime: 'image/jpeg', kind: 'image', category: 'images', label: 'JPEG' },
  jpeg: { ext: 'jpeg', mime: 'image/jpeg', kind: 'image', category: 'images', label: 'JPEG' },
  webp: { ext: 'webp', mime: 'image/webp', kind: 'image', category: 'images', label: 'WEBP' },
  gif: { ext: 'gif', mime: 'image/gif', kind: 'image', category: 'images', label: 'GIF' },
  svg: { ext: 'svg', mime: 'image/svg+xml', kind: 'vector', category: 'icons', label: 'SVG' },
  mp3: { ext: 'mp3', mime: 'audio/mpeg', kind: 'audio', category: 'audio', label: 'MP3' },
  wav: { ext: 'wav', mime: 'audio/wav', kind: 'audio', category: 'audio', label: 'WAV' },
  ogg: { ext: 'ogg', mime: 'audio/ogg', kind: 'audio', category: 'audio', label: 'OGG' },
  ttf: { ext: 'ttf', mime: 'font/ttf', kind: 'font', category: 'fonts', label: 'TTF' },
  otf: { ext: 'otf', mime: 'font/otf', kind: 'font', category: 'fonts', label: 'OTF' },
  woff: { ext: 'woff', mime: 'font/woff', kind: 'font', category: 'fonts', label: 'WOFF' },
  woff2: { ext: 'woff2', mime: 'font/woff2', kind: 'font', category: 'fonts', label: 'WOFF2' },
  glb: { ext: 'glb', mime: 'model/gltf-binary', kind: 'model3d', category: 'models3d', label: 'GLB' },
  gltf: { ext: 'gltf', mime: 'model/gltf+json', kind: 'model3d', category: 'models3d', label: 'GLTF' },
  obj: { ext: 'obj', mime: 'model/obj', kind: 'model3d', category: 'models3d', label: 'OBJ' },
  mtl: { ext: 'mtl', mime: 'model/mtl', kind: 'model3d', category: 'materials', label: 'MTL' },
  fbx: { ext: 'fbx', mime: 'application/octet-stream', kind: 'model3d', category: 'models3d', label: 'FBX' },
  stl: { ext: 'stl', mime: 'model/stl', kind: 'model3d', category: 'models3d', label: 'STL' },
  hdr: { ext: 'hdr', mime: 'image/vnd.radiance', kind: 'hdri', category: 'textures', label: 'HDR (Radiance)' },
  omnicomp: { ext: 'omnicomp', mime: 'application/json', kind: 'component', category: 'components', label: 'Componente OmniDesign' },
};

export const ACCEPT_ATTR = Object.keys(FORMATS).map((e) => `.${e}`).join(',');

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));
const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

function textHead(b: Uint8Array, n = 4096): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, n));
  } catch {
    return '';
  }
}

/** Heuristic: no NUL bytes in the first KB means text. */
function looksText(b: Uint8Array): boolean {
  const n = Math.min(b.length, 1024);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
}

/**
 * Check that the file content matches its extension (magic bytes / structure).
 * Returns an error message, or null when valid.
 */
export function validateContent(ext: string, bytes: Uint8Array): string | null {
  if (!bytes.length) return 'Arquivo vazio';
  const b = bytes;
  const ok = (cond: boolean, what: string) => (cond ? null : `Conteúdo não corresponde a um arquivo ${what} válido`);
  switch (ext) {
    case 'png':
      return ok(startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'PNG');
    case 'jpg':
    case 'jpeg':
      return ok(startsWith(b, [0xff, 0xd8, 0xff]), 'JPEG');
    case 'webp':
      return ok(ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP', 'WEBP');
    case 'gif':
      return ok(ascii(b, 0, 4) === 'GIF8', 'GIF');
    case 'svg':
      return ok(looksText(b) && /<svg[\s>]/i.test(textHead(b, 65536)), 'SVG');
    case 'mp3':
      return ok(ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), 'MP3');
    case 'wav':
      return ok(ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE', 'WAV');
    case 'ogg':
      return ok(ascii(b, 0, 4) === 'OggS', 'OGG');
    case 'ttf':
      return ok(startsWith(b, [0x00, 0x01, 0x00, 0x00]) || ascii(b, 0, 4) === 'true', 'TTF');
    case 'otf':
      return ok(ascii(b, 0, 4) === 'OTTO', 'OTF');
    case 'woff':
      return ok(ascii(b, 0, 4) === 'wOFF', 'WOFF');
    case 'woff2':
      return ok(ascii(b, 0, 4) === 'wOF2', 'WOFF2');
    case 'glb':
      return ok(ascii(b, 0, 4) === 'glTF', 'GLB');
    case 'gltf': {
      if (!looksText(b)) return 'GLTF deve ser JSON';
      try {
        const j = JSON.parse(new TextDecoder().decode(b));
        return ok(!!j && typeof j === 'object' && !!j.asset?.version, 'GLTF');
      } catch {
        return 'GLTF corrompido: JSON inválido';
      }
    }
    case 'obj':
      return ok(looksText(b) && /^\s*(v|vn|vt|f|o|g|mtllib|usemtl|#)\s/m.test(textHead(b)), 'OBJ');
    case 'mtl':
      return ok(looksText(b) && /^\s*(newmtl|#)\s/m.test(textHead(b)), 'MTL');
    case 'fbx':
      return ok(ascii(b, 0, 18) === 'Kaydara FBX Binary' || (looksText(b) && /FBXHeaderExtension/.test(textHead(b, 16384))), 'FBX');
    case 'stl': {
      if (looksText(b) && /^\s*solid\b/i.test(textHead(b, 256))) return null;
      // Binary STL: 80-byte header + uint32 triangle count + 50 bytes per triangle.
      if (b.length < 84) return 'STL corrompido';
      const count = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true);
      return ok(84 + count * 50 === b.length, 'STL');
    }
    case 'hdr':
      return ok(/^#\?(RADIANCE|RGBE)/.test(ascii(b, 0, 10)), 'HDR');
    case 'omnicomp': {
      if (!looksText(b)) return 'Componente deve ser JSON';
      try {
        const j = JSON.parse(new TextDecoder().decode(b));
        return ok(j?.format === 'omnidesign-component' && !!j.component && Array.isArray(j.component.elements), 'de componente');
      } catch {
        return 'Componente corrompido: JSON inválido';
      }
    }
    default:
      return 'Formato não suportado';
  }
}

export function detectFormat(name: string): FormatInfo | null {
  return FORMATS[extOf(name)] ?? null;
}
