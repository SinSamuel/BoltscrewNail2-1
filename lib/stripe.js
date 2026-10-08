import Stripe from 'stripe';

process.env.STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2025-03-31.basil';

let _stripe = null;

/**
 * Lazily-built Stripe client so endpoints fail with a clear message when the
 * key is missing instead of crashing the whole bundle at import time.
 */
export function getStripe() {
    if (_stripe) return _stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(key, { apiVersion: process.env.STRIPE_API_VERSION });
    return _stripe;
}