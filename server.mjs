// A small local-only development server. No packages or installation needed.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'text/plain'}; charset=utf-8`, 'Referrer-Policy':'strict-origin-when-cross-origin' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('PawFinder: http://127.0.0.1:4173'));
