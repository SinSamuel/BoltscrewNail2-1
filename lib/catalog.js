/**
 * Catalog mapping — Stripe Product/Price objects to the flat site catalog
 * shape consumed by shop.js. The mapping rules (metadata) are documented in
 * BACKEND-STRUCTURE.md §4.
 */

const KNOWN_CATS = new Set(['bolts', 'screws', 'nails', 'limited']);
const CAT_ALIASES = {
    'screw': 'screws',
    'bolt': 'bolts',
    'nail': 'nails',
    'special': 'limited',
    'specials': 'limited'
};

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
    'masonry': 'metal',
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

function normalizeImgUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const u = url.trim();
    if (!u) return '';
    // If it's an Imgur page/gallery URL, convert to direct image URL
    const imgurMatch = u.match(/^https?:\/\/(?:i\.)?imgur\.com\/(?:gallery\/|a\/)?(?:.*-)?([a-zA-Z0-9]+)(?:\.[a-zA-Z]{3,4})?$/);
    if (imgurMatch && imgurMatch[1]) {
        return `https://i.imgur.com/${imgurMatch[1]}.jpg`;
    }
    return u;
}

function extractMetaImages(meta) {
    if (!meta) return [];
    const found = [];
    // Scan all keys like img, img1, img2, img3... image, image1, image2...
    Object.keys(meta).forEach(k => {
        const lk = k.toLowerCase().trim();
        if (/^(img|image)[0-9]*$/.test(lk) || /^photo[0-9]*$/.test(lk)) {
            const rawVal = meta[k];
            if (rawVal && typeof rawVal === 'string') {
                const norm = normalizeImgUrl(rawVal);
                if (norm) found.push({ key: lk, url: norm });
            }
        }
    });
    // Sort naturally: img, img2, img3, etc.
    found.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    return found.map(f => f.url);
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
            let rawCat = String(meta.cat || '').toLowerCase().trim();
            if (CAT_ALIASES[rawCat]) rawCat = CAT_ALIASES[rawCat];
            const cat = KNOWN_CATS.has(rawCat) ? rawCat : 'other';
            const stockRaw = parseInt(meta.stock, 10);

            // Combine images from Stripe dashboard/API + any extra images in metadata (img2, img3, etc.)
            const baseImages = Array.isArray(p.images) ? p.images.map(normalizeImgUrl).filter(Boolean) : [];
            const metaImages = extractMetaImages(meta);
            const allImages = Array.from(new Set([...baseImages, ...metaImages]));

            return {
                id: p.id,
                priceId: price.id,
                name: p.name,
                description: p.description || meta.detail || '',
                image: allImages[0] || '',
                images: allImages,
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