/**
 * GET /api/config
 * Public runtime config for the pages (no secrets here).
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || '',
    currency: 'usd',
    taxRate: 0.07
  });
}
