/**
 * GET /api/img?u=<source image URL>&w=<width>
 *
 * On-demand product photo resizer. The photos in the Stripe catalog are
 * uploaded at full camera resolution (often 1000-1600px) while the shop cards
 * only draw them at ~200px, so the browser used to download 25-60x more pixels
 * than it displayed. Vercel's built-in image optimizer is not enabled for this
 * project, so this slim proxy shrinks each photo to the requested width and
 * then lets the CDN serve it for a year.
 *
 * Output is always WebP. On any failure the request is redirected to the
 * original file so a photo never disappears from the shop.
 */
import sharp from 'sharp';

/* Only the hosts that actually appear in the catalog are resizable. This keeps
   the endpoint from becoming a general-purpose proxy. */
const ALLOWED_HOSTS = new Set(['files.stripe.com', 'i.postimg.cc', 'i.imgur.com']);
const WIDTHS = new Set([200, 400, 800, 1200]);
const CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    let source;
    let width;
    try {
        const here = new URL(req.url, 'http://localhost');
        width = parseInt(here.searchParams.get('w') || '', 10);
        source = new URL(here.searchParams.get('u') || '');
    } catch {
        return res.status(400).json({ error: 'bad_request' });
    }

    if (!WIDTHS.has(width)) {
        return res.status(400).json({ error: 'unsupported_width' });
    }
    if (source.protocol !== 'https:' || !ALLOWED_HOSTS.has(source.hostname)) {
        return res.status(400).json({ error: 'unsupported_source' });
    }

    try {
        const upstream = await fetch(source.href, {
            headers: { 'User-Agent': 'boltscrewnail-img/1.0' },
            redirect: 'follow'
        });
        if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

        const declared = Number(upstream.headers.get('content-length') || 0);
        if (declared > MAX_SOURCE_BYTES) throw new Error('source too large');

        const input = Buffer.from(await upstream.arrayBuffer());
        if (!input.length || input.length > MAX_SOURCE_BYTES) throw new Error('source too large');

        const output = await sharp(input, { failOn: 'none' })
            .rotate()
            .resize({ width, withoutEnlargement: true, fit: 'inside' })
            .webp({ quality: 78, effort: 4 })
            .toBuffer();

        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Content-Length', String(output.length));
        res.setHeader('Cache-Control', CACHE);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.statusCode = 200;
        return res.end(req.method === 'HEAD' ? undefined : output);
    } catch (err) {
        console.error('[api/img]', err.message);
        /* Never break a product photo: send the browser to the original. */
        res.setHeader('Location', source.href);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.statusCode = 302;
        return res.end();
    }
}
