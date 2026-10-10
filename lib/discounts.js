/**
 * BOLTSCREWNAIL Fastener Discount Engine
 *
 * Rules:
 * 1. Volume Discount: 1% off for every $1,000 spent on the order (capped at 5% max for $5k+).
 * 2. Pallet Discount: 5% off on fastener lines when buying full pallet quantities (46 boxes for framing nails).
 * 3. 60-Day Spend Loyalty Tiers:
 *    - Silver: >= $5,000 in past 60 days -> +5% off
 *    - Gold:   >= $10,000 in past 60 days -> +10% off
 *    - Star:   >= $13,000 in past 60 days -> +13% off
 */

export const PALLET_BOXES_DEFAULT = 46;

// Specific item or category pallet configurations (boxes per pallet)
export const PALLET_CONFIG = {
    'nails': 46,
    'nails-strip': 46,
    'nails-coil': 46,
    'nails-staples': 46,
    'screws': 46,
    'bolts': 46
};

// Hardcoded test phone requested by user: 5095994975 with $9,000 60-day spend (Silver tier)
export const TEST_PHONE = '5095994975';
export const TEST_SPEND_60D = 9000;

/**
 * Normalizes phone numbers to standard 10-digit format for matching.
 * e.g. "+1 (509) 599-4975" -> "5095994975"
 */
export function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
        return digits.slice(1);
    }
    return digits;
}

/**
 * 1. Single-Order Volume Discount
 * 1% per $1,000 spent on order, capped at 5% max ($5,000+).
 */
export function calcVolumeDiscount(subtotal) {
    const thousands = Math.floor((subtotal || 0) / 1000);
    const percent = Math.min(5, Math.max(0, thousands));
    const amount = (subtotal * percent) / 100;
    return {
        percent,
        amount: Math.round(amount * 100) / 100,
        active: percent > 0,
        label: percent > 0 ? `VOLUME DISCOUNT (${percent}% ON $${thousands}K+)` : null
    };
}

/**
 * 2. Full Pallet Discount (5% off on lines with >= 46 boxes)
 * Excludes single tools, lots, or non-fastener supplies.
 */
export function calcPalletDiscount(lines, getProductFn, getVariantFn) {
    let palletEligibleSubtotal = 0;
    const palletLines = [];

    (lines || []).forEach(l => {
        const qty = parseInt(l.qty, 10) || 0;
        const p = getProductFn ? getProductFn(l.pid) : null;
        if (!p) return;

        // Skip limited power tools or single lot specials from pallet discount
        if (p.cat === 'limited' || p.sub === 'limited-power-tools') return;

        const reqBoxes = PALLET_CONFIG[p.sub] || PALLET_CONFIG[p.cat] || PALLET_BOXES_DEFAULT;
        if (qty >= reqBoxes) {
            const v = getVariantFn ? getVariantFn(p, l.sku) : (p.variants && p.variants[0]);
            const price = v && v.price != null ? v.price : 0;
            const lineSubtotal = price * qty;
            palletEligibleSubtotal += lineSubtotal;
            palletLines.push({
                pid: l.pid,
                sku: l.sku,
                name: p.name,
                qty,
                palletSize: reqBoxes,
                lineSubtotal
            });
        }
    });

    const percent = palletLines.length > 0 ? 5 : 0;
    const amount = (palletEligibleSubtotal * percent) / 100;

    return {
        percent,
        amount: Math.round(amount * 100) / 100,
        palletLines,
        active: palletLines.length > 0,
        label: palletLines.length > 0 ? `FULL PALLET DISCOUNT (5% ON ${palletLines.map(l => `${l.qty} BXS`).join(', ')})` : null
    };
}

/**
 * 3. 60-Day Spend Loyalty Tiers
 * - Silver: >= $5,000 -> 5%
 * - Gold:   >= $10,000 -> 10%
 * - Star:   >= $13,000 -> 13%
 */
export function getLoyaltyTier(spend60d) {
    const spend = Number(spend60d) || 0;
    if (spend >= 13000) {
        return { tier: 'Star', percent: 13, discountRate: 0.13, spend60d: spend, badge: '★ STAR TIER CONTRACTOR (13% OFF)' };
    }
    if (spend >= 10000) {
        return { tier: 'Gold', percent: 10, discountRate: 0.10, spend60d: spend, badge: '◆ GOLD TIER CONTRACTOR (10% OFF)' };
    }
    if (spend >= 5000) {
        return { tier: 'Silver', percent: 5, discountRate: 0.05, spend60d: spend, badge: '● SILVER TIER CONTRACTOR (5% OFF)' };
    }
    return { tier: null, percent: 0, discountRate: 0, spend60d: spend, badge: null };
}

/**
 * Calculate full stacked order breakdown
 */
export function computeOrderSummary({ subtotal, lines, loyaltyTier, getProductFn, getVariantFn }) {
    const sub = Number(subtotal) || 0;
    const vol = calcVolumeDiscount(sub);
    const pal = calcPalletDiscount(lines, getProductFn, getVariantFn);
    
    const tier = loyaltyTier || { tier: null, percent: 0, discountRate: 0 };
    const loyaltyAmount = (sub * tier.percent) / 100;

    const totalDiscount = Math.round((vol.amount + pal.amount + loyaltyAmount) * 100) / 100;
    const taxableSubtotal = Math.max(0, sub - totalDiscount);
    const tax = Math.round(taxableSubtotal * 0.07 * 100) / 100;
    const total = Math.round((taxableSubtotal + tax) * 100) / 100;

    return {
        subtotal: sub,
        volumeDiscount: vol,
        palletDiscount: pal,
        loyaltyDiscount: {
            tier: tier.tier,
            percent: tier.percent,
            amount: Math.round(loyaltyAmount * 100) / 100,
            active: tier.percent > 0,
            label: tier.badge
        },
        totalDiscount,
        effectiveDiscountPercent: sub > 0 ? Math.round((totalDiscount / sub) * 100) : 0,
        tax,
        total
    };
}
