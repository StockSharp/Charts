// Minimal static server for the demo (some tooling refuses to load file://).
// Serves the repo root on :8791; browse http://localhost:8791/demo/index.html.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// Host/port are overridable via env so the demo can be exposed on a LAN address.
// Default HOST 0.0.0.0 binds every interface (localhost + LAN IP).
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 8791;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json', '.css': 'text/css' };

createServer(async (req, res) => {
    try {
        const url = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = normalize(url).replace(/^(\.\.[/\\])+/, '');
        const file = join(root, rel === '/' ? 'demo/index.html' : rel);
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end('not found');
    }
}).listen(PORT, HOST, () => console.log(`serving Charts on http://${HOST}:${PORT}/demo/index.html (LAN-reachable when HOST is 0.0.0.0)`));
