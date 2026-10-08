import { getStripe } from '../lib/stripe.js';

/**
 * POST /api/webhook
 * Stripe webhook receiver. Vercel serves the raw body as req.rawBody; the
 * signature check uses STRIPE_WEBHOOK_SECRET (set in Vercel env vars).
 *
 * Handled events: invoice.finalized, invoice.sent, invoice.paid — all funnel
 * into deductStock(), which decrements product stock by the order's quantities.
 * Idempotency is enforced with the invoice metadata flag `stock_deducted`,
 * set before the decrements so retries / later events cannot double-apply.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8'),
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('[api/webhook] signature failed:', err.message);
        return res.status(400).json({ error: 'invalid_signature' });
    }

    try {
        if (['invoice.finalized', 'invoice.sent', 'invoice.paid'].includes(event.type)) {
            await deductStock(stripe, event.data.object.id);
        }
    } catch (err) {
        console.error('[api/webhook] handler:', event.type, err.message);
        // Acknowledge anyway — at-least-once delivery + the stock_deducted
        // guard means a retry is safe. The invoice stays visible in the
        // dashboard for a manual fix if something is genuinely wrong.
        return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true });
}

async function deductStock(stripe, invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    const meta = invoice.metadata || {};
    if (meta.stock_deducted === 'true') return;   // already applied
    if (!meta.cart) return;                       // not a website order

    let cart;
    try { cart = JSON.parse(meta.cart); } catch { cart = null; }
    if (!Array.isArray(cart) || !cart.length) return;

    // Mark first so a concurrent retry sees the guard and backs off.
    await stripe.invoices.update(invoiceId, { metadata: { ...meta, stock_deducted: 'true' } });

    for (const line of cart) {
        const productId = line.productId;
        const qty = Math.max(1, Math.floor(Number(line.qty)) || 1);
        if (!productId) continue;
        const product = await stripe.products.retrieve(productId);
        const current = parseInt(product.metadata.stock, 10);
        if (!Number.isFinite(current)) continue;   // no stock tracked → nothing to deduct
        const next = Math.max(0, current - qty);
        await stripe.products.update(productId, {
            metadata: { ...product.metadata, stock: String(next) }
        });
    }
}