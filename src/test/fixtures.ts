/** Minimal valid files for tests (real headers, tiny payloads). */
export const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
export const PNG_OTHER = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
export const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
export const WAV = (() => {
  const b = new Uint8Array(44);
  b.set(new TextEncoder().encode('RIFF'), 0);
  b.set(new TextEncoder().encode('WAVEfmt '), 8);
  return b;
})();
export const WOFF2 = new Uint8Array([...new TextEncoder().encode('wOF2'), 0, 1, 0, 0]);
export const OBJ = new TextEncoder().encode('# cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
export const GLTF = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scenes: [] }));

export const file = (bytes: Uint8Array, name: string, type = '') => new File([bytes], name, { type });
