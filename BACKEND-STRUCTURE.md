# BOLTSCREWNAIL — Backend & Site Structure

Host: **Vercel** · Catalog + stock + invoices: **Stripe** · Analytics: **GA4**

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Hosting | Vercel (static pages + serverless functions) |
| Payment | **Off-site by invoice.** Site never takes a card. Order creates a **draft Stripe Invoice**; the shop reviews and sends invoices in a batch (end of day). |
| Product catalog | Stripe Dashboard is the single source of truth. Client adds/edits name, image, description, price, stock there. Nothing product-related is hardcoded in the site. |
| Variants | **Each variant is its own Stripe Product** — own price, own stock count, own image. The site regroups them by the `family` metadata key so the size/finish dropdown UX stays the same. |
| Stock | Stored in Stripe **product metadata** (`stock`). Edited only in the Stripe Dashboard. |
| Stock decrement | When the shop **confirms/sends** the invoice (webhook), not at order time. |
| Tax | **Stripe Tax automatic** on the invoice (0.5% per transaction). |
| Analytics | GA4 via gtag, with full ecommerce events. |
| Cart | Unchanged — `sessionStorage`, `bsn_cart_v1`. |

---

## 2. Order flow

```
customer builds cart (client-side, sessionStorage)
        │
        ▼
fills order form → POST /api/order  { lines, customer, delivery }
        │
        ├── re-reads stock from Stripe (live API call)
        │     └── qty > stock  → 409 { error, stock }  →  in-stock popup on site
        │
        ├── creates/reuses Stripe Customer (email match) with delivery address
        │
        ├── creates DRAFT Stripe Invoice
        │     · line items = cart (price id + qty)
        │     · automatic_tax enabled → tax computed from customer address
        │     · metadata: cart payload, phone, confirm preference, source
        │
        ▼
200 { invoiceId, url }  →  success screen + GA4 `purchase`
        │
        ▼
shop batches invoices from Stripe Dashboard → sends them
        │
        ▼
webhook invoice.finalized / invoice.sent / invoice.paid
        │
        ├── decrement `stock` metadata for each line  (deduped by invoice id)
        └── GA4 order value reconciled on `purchase`
```

---

## 3. Files

```
boltscrewnails2.0/
├── index.html            static landing (unchanged, GA snippet added)
├── shop.html             static shell — section/grid divs become render targets
├── style.css, shop.css   unchanged
├── main.js               unchanged
├── shop.js               catalog fetch, dynamic render, order POST, GA events
│
├── api/                  ← Vercel serverless functions
│   ├── products.js       GET   catalog from Stripe (cached 60s)
│   ├── order.js          POST  validate stock → draft invoice
│   ├── webhook.js        POST  Stripe events → decrement stock
│   └── config.js         GET   GA4 measurement id (public)
│
├── lib/
│   ├── stripe.js         Stripe client + metadata conventions
│   └── catalog.js        Stripe product/price → site product mapping
│
├── package.json          deps: stripe
├── vercel.json           function config, routes, cache headers
├── .env.local            secrets (git-ignored)
└── .gitignore
```

### API contract

**`GET /api/products`**
```jsonc
// 200
{
  "cachedAt": 1770000000000,
  "products": [{
    "id": "prod_xxx",          // Stripe product id
    "priceId": "price_xxx",     // Stripe price id (used on order)
    "name": "HEX CAP GRADE 8",
    "description": "...",
    "image": "https://...",
    "price": 15.5,              // dollars
    "currency": "usd",
    "cat": "bolts",             // metadata
    "sub": "bolts-structural",  // {cat}-{family} → grid id grid-{sub}
    "group": "",                // same group id → one card with size dropdown
    "variant": "",              // size label on grouped children
    "badge": "",                // "Most Used" / "Limited" / ""
    "stock": 42,
    "order": 10
  }]
}
```

**`POST /api/order`** — validates live stock, then creates a **DRAFT**
invoice (`collection_method: send_invoice`, `days_until_due: 7`) with Stripe
automatic tax; the site never collects payment. The exact cart is embedded
in the invoice metadata (`cart` = JSON of `{priceId, productId, qty}`) for
the webhook. Draft invoices have no hosted payment URL — the shop sends them
from Stripe in its end-of-day batch.
```jsonc
// request
{
  "lines": [{ "priceId": "price_xxx", "qty": 3 }],
  "customer": { "name", "company", "email", "phone" },
  "delivery": { "address", "contact", "phone" },
  "confirm": "call" | "text" | "email"
}
// 200  { "invoiceId": "in_xxx", "status": "draft", "confirm", "currency", "estimatedSubtotal", "automaticTax" }
// 409  { "error": "out_of_stock", "items": [{ "priceId", "requested", "available" }] }
// 400  { "error": "invalid_items" | "missing_customer" | "missing_delivery" }
// 500  { "error": "server_error" }
```
`automaticTax` is `false` by default on this account: Stripe Tax can't be
activated until the account is verified (business ID), so NC sales tax is
computed manually at a hardcoded local location (**101 Main St, Angier, NC
27501**, flat **7%**, overridable via `TAX_PERCENT`/`TAX_LOCATION`) and added
as an explicit "NC SALES TAX (7%) — …" invoice line. Invoices carry metadata
`tax_location` / `tax_percent`; set `STRIPE_TAX=true` once activation is done
to switch back to Stripe automatic tax.
`limited`/`specials` items are capped at qty 1 server-side regardless of stock.

**`POST /api/webhook`** — raw body (`req.rawBody`), signature verified with
`STRIPE_WEBHOOK_SECRET` (Vercel env var; a test value is runnable locally).
Handled events: `invoice.finalized`, `invoice.sent`, `invoice.paid`.
All three funnel into one `deductStock(invoiceId)`: it reads the `cart`
metadata, subtracts each qty from the product's `stock` metadata, and marks
invoice metadata `stock_deducted = "true"` **before** updating products so a
retry or a later event cannot double-decrement.

---

## 4. Stripe metadata conventions

Client fills these in the Stripe Dashboard.

### Product
| Key | Example | Meaning |
|---|---|---|
| `cat` | `bolts` \| `screws` \| `nails` \| `limited` | main nav section (§5) |
| `family` | `strip` \| `coil` \| `structural` \| `lots` \| `power tools` … | **placement** — the sub-section within `cat`. Products with `cat: nails, family: strip` land in the STRIP section; `cat: limited, family: power tools` lands in LIMITED → POWER TOOLS. |
| `group` | `21plastic` | products sharing a `group` render as **one card with a size dropdown**; empty = standalone card |
| `stock` | `42` | units available. **This is the stock count.** |
| `badge` | `Most Used` | tag shown on the card |
| `order` | `10` | sort index inside its sub-section (asc) |
| `variant` | `3.5" × .131` | the dropdown label on child products of a `group` |

Legacy `sub` key is still read as a fallback when `family` is missing
(pre-Phase 2 data) — but new products should always set `family`.

> Products with `active = false` are hidden from the site automatically.

---

## 5. Category map (must match `family` values)

| `cat` | `family` |
|---|---|
| bolts | structural, anchor, specialty |
| screws | construction, interior, masonry |
| nails | strip, coil, finish, bulk, staples |
| limited | power tools, lots |

Legacy `cat: specials` still maps to the `limited` section so pre-rename
data keeps working. Any other typo'd `cat`/`family` falls back to `other` —
it renders in the auto-appended OTHER section at the bottom instead of
breaking the page.

---

## 6. Frontend changes in `shop.js`

| Now | After |
|---|---|
| `const products = [ … ]` hardcoded (line 15) | `await fetch('/api/products')`, same shape kept so `renderCard`, `priceFor`, `findProduct` stay untouched |
| section/grid divs hardcoded in `shop.html` | built at boot from catalog metadata; ids stay `#grid-{cat}-{sub}` so existing anchors keep working |
| `PRICING` formula for nails | deleted — Stripe holds the real price per variant |
| order form has no submit handler (page reloads) | `POST /api/order`, then success screen |
| stock unknown | stock shown in the modal; over-qty blocked with the existing qty popup fed real numbers |
| `loyaltyDB` hardcoded (line 105) | removed from the price path; discounts handled on the Stripe invoice if the client wants them |

### GA4 events
| Event | Fired when |
|---|---|
| `view_item_list` | catalog renders |
| `view_item` | product modal opens |
| `add_to_cart` | qty added |
| `begin_checkout` | invoice/order modal opens |
| `purchase` | `/api/order` returns 200 — `transaction_id` = invoice id, `value` = order total |

---

## 7. Environment variables (.env.local, git-ignored)

```
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

Public values (`GA4_MEASUREMENT_ID`) are read by `api/config.js` and inlined by
the pages at boot — never expose `STRIPE_SECRET_KEY` to the client.

---

## 8. Setup steps (once)

1. `apt install git` (git is not on this machine yet) + `git init`
2. `npm i stripe`, create `vercel.json`, link Vercel project
3. Stripe → Developers → Webhooks → endpoint `https://<domain>/api/webhook`
   with the three invoice events → copy `whsec_` into `.env.local`
4. Stripe → Settings → Tax → enable automatic tax
5. GA4 property → copy `G-XXXXXXXXXX` into `.env.local`
6. Client creates products in the Stripe Dashboard using §4 metadata

---

## 9. Known tradeoffs

- **Oversell window.** Stock only drops when the invoice is sent, so two
  orders placed before the shop confirms can both claim the last box. The
  order-time check narrows but cannot eliminate it. Cheap mitigation (no DB):
  `available = stock − Σ quantities on open draft invoices`, computed in
  `/api/products` with a short cache.
- **Webhook delivery is at-least-once.** Handled by the per-invoice
  `stock_deducted` metadata guard.
- **Stripe Tax + Invoicing cost extra** (tax 0.5%/txn + per-invoice fee on
  the relevant plan).
