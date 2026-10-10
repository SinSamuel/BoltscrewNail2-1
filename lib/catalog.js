/**
 * Catalog mapping — Stripe Product/Price objects to the flat site catalog
 * shape consumed by shop.js. The mapping rules (metadata) are documented in
 * BACKEND-STRUCTURE.md §4.
 */

const KNOWN_CATS = new Set(['bolts', 'screws', 'nails', 'limited']);

function slugify(sub) {
    return String(sub || '')
        .toLowerCase()
        .trim()
        .replace(/^sub-/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const FAMILY_ALIASES = {
    'power-tool': 'power-tools',
    'lot': 'lots',
};

function normSub(cat, sub) {
    let s = slugify(sub);
    if (!s) return `${cat}-other`;
    if (FAMILY_ALIASES[s]) s = FAMILY_ALIASES[s];
    return s.startsWith(`${cat}-`) ? s : `${cat}-${s}`;
}

export function priceToDollars(price) {
    return (price && price.unit_amount != null ? price.unit_amount : 0) / 100;
}

/**
 * Map a page of Stripe products (with data.default_price expanded) into the
 * flat API catalog items. `active` products only; products without a default
 * price are skipped.
 */
export function mapCatalog(products) {
    return products
        .filter(p => p.active !== false && p.default_price && p.default_price.active !== false)
        .map(p => {
            const meta = p.metadata || {};
            const price = p.default_price;
            const rawCat = String(meta.cat || '').toLowerCase().trim();
            const cat = rawCat === 'specials' ? 'limited'
                : (KNOWN_CATS.has(rawCat) ? rawCat : 'other');
            const stockRaw = parseInt(meta.stock, 10);
            return {
                id: p.id,
                priceId: price.id,
                name: p.name,
                description: p.description || meta.detail || '',
                image: (p.images && p.images[0]) || '',
                images: p.images || [],
                price: priceToDollars(price),
                currency: price.currency || 'usd',
                cat,
                sub: normSub(cat, meta.family || meta.sub),
                group: meta.group || '',
                variant: meta.variant || '',
                finish: meta.finish || (price.metadata && price.metadata.finish) || '',
                gauge: meta.gauge || '',
                shank: meta.shank || '',
                badge: meta.badge || '',
                stock: Number.isFinite(stockRaw) ? stockRaw : undefined,
                order: parseInt(meta.order, 10) || 999
            };
        })
        .sort((a, b) => {
            // Explicit order pin (< 999) takes top priority
            const aOrd = (a.order && a.order < 999) ? a.order : Infinity;
            const bOrd = (b.order && b.order < 999) ? b.order : Infinity;
            if (aOrd !== bOrd) return aOrd - bOrd;
            // Otherwise: most stock first; undefined/missing stock goes to the end
            const aStock = a.stock ?? -1;
            const bStock = b.stock ?? -1;
            if (bStock !== aStock) return bStock - aStock;
            return a.name.localeCompare(b.name);
        });
}