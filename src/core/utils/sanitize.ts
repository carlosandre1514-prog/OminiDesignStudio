/** Escape text for safe insertion into generated HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normalise a user supplied name: trims, collapses whitespace and caps length. */
export function sanitizeName(value: string, fallback = 'Sem título', max = 120): string {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return clean || fallback;
}

/** Produce a filesystem / identifier friendly slug. */
export function slugify(value: string, fallback = 'item'): string {
  const s = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

/** PascalCase identifier usable as a React component name. */
export function toComponentName(value: string, fallback = 'Screen'): string {
  const parts = slugify(value, '').split('-').filter(Boolean);
  let name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('');
  if (!name) name = fallback;
  if (/^[0-9]/.test(name)) name = `${fallback}${name}`;
  return name;
}

/** Only allow safe URL schemes in exported/previewed links and images. */
export function safeUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^(https?:|data:image\/|blob:|\/|\.\/|#)/i.test(trimmed)) return trimmed;
  return '';
}

/** Allow only CSS colour-like values (hex, rgb/hsl functions, named colours, transparent). */
export function safeColor(value: string | undefined, fallback = 'transparent'): string {
  if (!value) return fallback;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v)) return v;
  return fallback;
}
