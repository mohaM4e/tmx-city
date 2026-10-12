// Tiny dependency-free static server for ./public, with gzip (users.json shrinks ~5x).
// Usage: npm start   (PORT=8080 npm start to change the port)
import http from 'node:http';
import zlib from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
const cache = new Map(); // file -> { mtime, raw, gz }

async function load(file) {
  const st = await stat(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = await readFile(file);
  const entry = { mtime: st.mtimeMs, raw, gz: zlib.gzipSync(raw, { level: 6 }) };
  cache.set(file, entry);
  return entry;
}

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
    const { raw, gz } = await load(file);
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && types[extname(file)]) {
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }).end(gz);
    } else {
      res.writeHead(200, headers).end(raw);
    }
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`TMX City running at http://localhost:${PORT}`));
