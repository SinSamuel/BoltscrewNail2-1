import { getStripe } from '../lib/stripe.js';
import { mapCatalog } from '../lib/catalog.js';

/**
 * GET /api/products
 * Live catalog from the Stripe Dashboard. Cached for 60s on Vercel's CDN.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    try {
        const stripe = getStripe();
        const products = mapCatalog((await stripe.products.list({
            active: true,
            limit: 100,
            expand: ['data.default_price']
        })).data);
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ cachedAt: Date.now(), products });
    } catch (err) {
        console.error('[api/products]', err.message);
        return res.status(500).json({ error: 'catalog_unavailable' });
    }
}