import { getStripe } from '../lib/stripe.js';
import { normalizePhone, getLoyaltyTier, TEST_PHONE, TEST_SPEND_60D } from '../lib/discounts.js';

/**
 * GET /api/loyalty?phone=...
 *
 * Looks up customer 60-day spend in Stripe to determine their contractor tier.
 * Special test override: Phone 5095994975 is hardcoded to $9,000 spend (Silver tier, 5% off).
 *
 * 200 { found: boolean, spend60d: number, tier: string|null, percent: number, badge: string|null }
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    const rawPhone = req.query && req.query.phone;
    const phone = normalizePhone(rawPhone);

    if (!phone || phone.length < 7) {
        return res.status(200).json({
            found: false,
            spend60d: 0,
            tier: null,
            percent: 0,
            badge: null
        });
    }

    // 1. Check test hardcode requested by user
    if (phone === TEST_PHONE) {
        const tier = getLoyaltyTier(TEST_SPEND_60D);
        return res.status(200).json({
            found: true,
            phone,
            spend60d: TEST_SPEND_60D,
            tier: tier.tier,
            percent: tier.percent,
            badge: tier.badge,
            isTest: true
        });
    }

    // 2. Stripe live lookup
    try {
        const stripe = getStripe();
        let matchedCustomer = null;

        // Try search query first
        try {
            const searchRes = await stripe.customers.search({
                query: `phone:\'${phone}\'`,
                limit: 1
            });
            if (searchRes.data && searchRes.data.length > 0) {
                matchedCustomer = searchRes.data[0];
            }
        } catch {
            // Search API fallback: list recent customers
            const listRes = await stripe.customers.list({ limit: 100 });
            matchedCustomer = (listRes.data || []).find(c => normalizePhone(c.phone) === phone) || null;
        }

        if (!matchedCustomer) {
            return res.status(200).json({
                found: false,
                spend60d: 0,
                tier: null,
                percent: 0,
                badge: null
            });
        }

        // Query paid invoices within last 60 days
        const sixtyDaysAgo = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);
        const invList = await stripe.invoices.list({
            customer: matchedCustomer.id,
            status: 'paid',
            created: { gte: sixtyDaysAgo },
            limit: 100
        });

        const spendCents = (invList.data || []).reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
        const spend60d = Math.round((spendCents / 100) * 100) / 100;

        const tier = getLoyaltyTier(spend60d);
        return res.status(200).json({
            found: true,
            customerId: matchedCustomer.id,
            customerName: matchedCustomer.name,
            spend60d,
            tier: tier.tier,
            percent: tier.percent,
            badge: tier.badge
        });
    } catch (err) {
        console.error('[api/loyalty] Error:', err.message);
        return res.status(200).json({
            found: false,
            spend60d: 0,
            tier: null,
            percent: 0,
            badge: null,
            error: 'stripe_unavailable'
        });
    }
}
