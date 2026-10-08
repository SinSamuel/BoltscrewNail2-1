import { getStripe } from '../lib/stripe.js';

/**
 * POST /api/order
 * Places an order WITHOUT taking payment: validates live stock against the
 * Stripe catalog, reuses or creates the customer, then creates a DRAFT
 * Stripe invoice (collection_method: send_invoice). The account isn't
 * activated for Stripe Tax, so sales tax is computed from a hardcoded local
 * location and added as an invoice line. The shop reviews and sends that
 * invoice from Stripe (end-of-day batch), at which point the webhook
 * decrements stock. The site never touches card numbers.
 *
 * 200  { invoiceId, status: "draft", confirm, currency, estimatedSubtotal,
 *        estimatedTax, estimatedTotal, taxPercent, taxLocation }
 * 400  { error: "invalid_items" | "missing_customer" | "missing_delivery" }
 * 409  { error: "out_of_stock", items: [{ priceId, requested, available }] }
 * 500  { error: "server_error" }
 */

// Hardcoded tax location — Stripe Tax can't be activated on this account
// (no business ID yet), so NC sales tax is computed locally at this address.
const TAX_LOCATION = '101 Main St, Angier, NC 27501';
const TAX_PERCENT = Number(process.env.TAX_PERCENT) || 7;
// Set STRIPE_TAX=true once Stripe Tax is activated: reverts to automatic tax
// (needs the head office address set in Stripe Settings > Tax).
const AUTO_TAX = process.env.STRIPE_TAX === 'true';
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    const body = req.body || {};
    const rawLines = Array.isArray(body.lines) ? body.lines : null;
    if (!rawLines || !rawLines.length) return res.status(400).json({ error: 'invalid_items' });

    const lines = [];
    for (const it of rawLines) {
        const priceId = typeof it.priceId === 'string' ? it.priceId.trim() : '';
        const qty = Math.floor(Number(it.qty));
        if (!priceId || !Number.isFinite(qty) || qty < 1) {
            return res.status(400).json({ error: 'invalid_items' });
        }
        lines.push({ priceId, qty });
    }

    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const delivery = body.delivery && typeof body.delivery === 'object' ? body.delivery : {};
    const confirm = ['call', 'text', 'email'].includes(body.confirm) ? body.confirm : 'call';

    const custName = String(customer.name || '').trim();
    const email = String(customer.email || '').trim();
    const addressText = String(delivery.address || '').trim();
    if (!custName || !email) return res.status(400).json({ error: 'missing_customer' });
    if (!addressText) return res.status(400).json({ error: 'missing_delivery' });

    const stripe = getStripe();

    // 1. Live stock check against the Stripe product metadata.
    const lineInfo = [];
    const shortItems = [];
    const currencies = new Set();
    for (const line of lines) {
        let price;
        try {
            price = await stripe.prices.retrieve(line.priceId, { expand: ['product'] });
        } catch {
            return res.status(400).json({ error: 'invalid_items' });
        }
        if (!price.active) return res.status(400).json({ error: 'invalid_items' });
        const product = price.product;
        const meta = (product && product.metadata) || {};
        const stock = parseInt(meta.stock, 10);
        const requested = line.qty;
        if (Number.isFinite(stock) && requested > stock) {
            shortItems.push({ priceId: line.priceId, requested, available: stock });
        }
        // 'limited'/'specials' items are one-per-order regardless of stock.
        if ((meta.cat === 'limited' || meta.cat === 'specials') && requested > 1) {
            shortItems.push({ priceId: line.priceId, requested, available: 1 });
        }
        lineInfo.push({
            priceId: line.priceId,
            productId: product ? product.id : null,
            qty: requested,
            unit: price.unit_amount || 0
        });
        currencies.add(price.currency || 'usd');
    }
    if (shortItems.length) {
        return res.status(409).json({ error: 'out_of_stock', items: shortItems });
    }

    // 2. Customer — reuse a Stripe customer with the same email, else create.
    let cust;
    const match = (await stripe.customers.list({ email, limit: 1 })).data[0];
    if (match) {
        cust = await stripe.customers.update(match.id, {
            name: custName,
            phone: customer.phone || match.phone || undefined,
            metadata: { company: String(customer.company || '') }
        });
    } else {
        cust = await stripe.customers.create({
            name: custName,
            email,
            phone: customer.phone || undefined,
            metadata: { company: String(customer.company || '') },
            shipping: shippingPayload(customer, delivery)
        });
    }

    // Keep the latest shipping/contact details on the customer.
    cust = await stripe.customers.update(cust.id, { shipping: shippingPayload(customer, delivery) });

    // 3. Draft invoice + line items. Embed the exact cart in invoice metadata
    //    so the webhook can decrement stock without re-deriving anything.
    const cartPayload = lineInfo.map(l => ({ priceId: l.priceId, productId: l.productId, qty: l.qty }));
    const subtotalCents = lineInfo.reduce((s, l) => s + l.unit * l.qty, 0);
    const taxCents = AUTO_TAX ? 0 : Math.round(subtotalCents * TAX_PERCENT / 100);
    const invoiceMeta = Object.assign({
        cart: JSON.stringify(cartPayload),
        confirm,
        source: 'website',
        stock_deducted: 'false'
    }, AUTO_TAX ? {} : { tax_manual: 'true', tax_location: TAX_LOCATION, tax_percent: String(TAX_PERCENT) });

    const invoice = await stripe.invoices.create({
        customer: cust.id,
        collection_method: 'send_invoice',
        days_until_due: 7,
        automatic_tax: { enabled: AUTO_TAX },
        currency: [...currencies][0] || 'usd',
        metadata: invoiceMeta
    });

    for (const line of lineInfo) {
        await stripe.invoiceItems.create({
            customer: cust.id,
            invoice: invoice.id,
            pricing: { price: line.priceId },
            quantity: line.qty
        });
    }
    if (!AUTO_TAX && taxCents > 0) {
        await stripe.invoiceItems.create({
            customer: cust.id,
            invoice: invoice.id,
            currency: invoice.currency,
            amount: taxCents,
            description: `NC SALES TAX (${TAX_PERCENT}%) — ${TAX_LOCATION}`
        });
    }

    return res.status(200).json({
        invoiceId: invoice.id,
        status: 'draft',
        confirm,
        currency: invoice.currency,
        estimatedSubtotal: subtotalCents / 100,
        estimatedTax: taxCents / 100,
        estimatedTotal: (subtotalCents + taxCents) / 100,
        taxPercent: TAX_PERCENT,
        taxLocation: TAX_LOCATION,
        automaticTax: AUTO_TAX
    });
}

function shippingPayload(customer, delivery) {
    const text = String(delivery.address || '').trim();
    return {
        name: String(delivery.contact || customer.name || '').trim(),
        phone: delivery.phone || customer.phone || undefined,
        address: parseAddress(text)
    };
}

/**
 * Best-effort parse of the single free-text delivery address into Stripe's
 * structured shape. Falls back to putting the whole string in line1 — the
 * shop can correct anything sloppy in the dashboard before sending. */
function parseAddress(raw) {
    const text = String(raw || '').trim();
    if (!text) return { country: 'US' };
    const m = text.match(/^([\s\S]+?)[,\s]+([A-Za-z .'-]+)[,\s]+([A-Z]{2})[,\s]+([A-Za-z0-9-]{3,10})$/);
    if (m) return { line1: m[1], city: m[2], state: m[3], postal_code: m[4], country: 'US' };
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^\d{5}(-\d{4})?$/.test(last)) {
        return {
            line1: parts.slice(0, -1).join(', '),
            city: parts.length > 1 ? parts[parts.length - 2] : last,
            postal_code: last,
            country: 'US'
        };
    }
    return { line1: text, country: 'US' };
}