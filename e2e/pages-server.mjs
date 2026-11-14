// Serves dist/ like GitHub Pages: under /<BASE>/ and with 404.html for unknown paths (SPA deep links).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const BASE = process.env.BASE_PATH ?? '/OminiDesignStudio/';
const PORT = Number(process.env.PORT ?? 4175);
const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith(BASE)) {
    let rel = normalize(path.slice(BASE.length)).replace(/^(\.\.[/\\])+/, '');
    if (!rel || rel === '.' || rel.endsWith('/')) rel = rel === '.' ? 'index.html' : rel + 'index.html';
    try {
      const body = await readFile(join(ROOT, rel));
      res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {
      /* fall through to 404.html */
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(await readFile(join(ROOT, '404.html')));
}).listen(PORT, () => console.log(`GitHub Pages simulado em http://localhost:${PORT}${BASE}`));
