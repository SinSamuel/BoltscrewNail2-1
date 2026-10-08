/**
 * Local dev server — serves the static site and runs the Vercel-style
 * handlers in api/ the same way `vercel dev` would (without needing the
 * Vercel CLI or an account). Requires .env.local to be present.
 *
 *   npm run dev:local      →  http://localhost:3000/shop.html
 */
import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || 3000;

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avif': 'image/avif',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

async function loadHandler(urlPath) {
    const name = urlPath.replace(/^\/+/, '').replace(/\/+$/, '') || 'index';
    const file = path.join(root, name + '.js');
    try {
        const mod = await import(pathToFileURL(file).href);
        return mod.default || null;
    } catch {
        return null;
    }
}

function runHandler(handler, req, res) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
        try {
            const raw = Buffer.concat(chunks).toString('utf8');
            let body = raw;
            if (body) { try { body = JSON.parse(body); } catch { /* keep raw */ } }
            const u = new URL(req.url, 'http://localhost');
            const vreq = { method: req.method, url: req.url, headers: req.headers, body, rawBody: raw, query: Object.fromEntries(u.searchParams) };
            const vres = {
                statusCode: 200, headers: {}, ended: false,
                setHeader(k, v) { this.headers[k] = v; },
                status(c) { this.statusCode = c; return this; },
                json(o) { this.end(JSON.stringify(o)); },
                end(b) {
                    if (this.ended) return;
                    this.ended = true;
                    if (b !== undefined && !this.headers['Content-Type']) this.headers['Content-Type'] = 'application/json';
                    res.writeHead(this.statusCode, this.headers);
                    res.end(b === undefined ? '' : b);
                }
            };
            await handler(vreq, vres);
            if (!vres.ended) vres.end('');  // handler returned without answering
        } catch (err) {
            console.error('[handler]', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'server_error' }));
        }
    });
}

const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const p = path.normalize(u.pathname).replace(/\\/g, '/');
    if (p.startsWith('/api/')) {
        const handler = await loadHandler(p);
        if (handler) return runHandler(handler, req, res);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'not_found' }));
    }
    await serveStatic(p, res);
});

async function serveStatic(p, res) {
    const file = path.join(root, p.replace(/^[/\\]+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    try {
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    } catch {
        res.writeHead(404); res.end('Not found');
    }
}

server.listen(port, () => console.log(`BOLTSCREWNAIL local dev → http://localhost:${port}/shop.html`));