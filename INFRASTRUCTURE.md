# BOLTSCREWNAIL — Infrastructure Cleanup Plan

**Goal:** one repo, one Vercel project, one domain. No stale copies, no old
deployments competing for the same customers.

**Status:** plan only. Nothing here has been changed yet — every destructive step
below needs your go-ahead, and the Vercel steps need a login.

---

## 1. What exists today (checked 16 Nov 2026)

### GitHub — `SinSamuel`, 5 repositories

| Repo | What it is | Last push | Action |
|---|---|---|---|
| **`BoltscrewNail2-1`** | **The shop site — production source of truth** | **2026-11-16** | **Keep. Rename → `boltscrewnail`.** |
| `hugo-abconstruction` | A different business site (commercial framing / decks) | 2026-10-17 | Keep as its own repo — not part of this cleanup |
| `blueELD-backend` | Unrelated 2023 project | 2024-08-17 | **Archive** (reversible; keeps history) |
| `SinSamuel` | GitHub profile README | 2023 | Keep |

Two problems already visible in the repo settings:

- The repo's **homepage field points to `https://boltscrewnails2-1.vercel.app`** —
  the old, wrong deployment. It should be the real domain.
- The repo name still says `2-1`, which is what makes every conversation about
  "which site is live?" harder than it should be.

### Vercel — at least 2 projects

| Project | Status | Evidence |
|---|---|---|
| `boltscrewnail2-2` | **Live and correct** — this is the one serving today's site | GitHub deploy status, verified pages |
| `boltscrewnails2-1` | Old build, still reachable | GitHub deploy status, serves stale content |

There may be more. The Vercel CLI on this machine is logged out, so the full list
needs either `vercel login` or a token — see §5.

### Local machine

- `C:\Users\tatia\Desktop\boltscrewnails2.0` — stale, on branch **`master`**
  (production is `main`), with uncommitted edits, no `node_modules`, and the only
  copy of `.env.local`. This folder is a trap: it looks like the project but it is
  not the project.
- No `.vercel/project.json` link anywhere, so local CLI deploys can't target the
  wrong project by accident today.

### Domain

None. The public URL is a `vercel.app` subdomain, which is why nobody can remember
it, it looks unfinished on invoices, and 10DLC / email have nothing to attach to.

---

## 2. Target state

| Thing | Target |
|---|---|
| GitHub | **1 repo**: `SinSamuel/boltscrewnail`, branch `main`, homepage = the domain |
| Vercel | **1 project**: `boltscrewnail`, connected to that repo, all env vars |
| Domain | **`boltscrewnail.com`** — apex + `www`, Vercel auto-SSL, `*.vercel.app` → 301 to it |
| Email | `orders@` / `info@` / `sam@` on the domain → Cloudflare Email Routing (free) → Gmail now, `/api/email/inbound` later |
| Local | **1 clean clone**, `main`, one `.env.local` |
| Old projects | Disconnected, kept 2 weeks, then deleted |
| Old repos | Archived, never deleted |

**Domain check:** `boltscrewnail.com` had no RDAP registration record on
16 Nov 2026, so it looks available (verify at the registrar before paying).
`boltscrewnails.com`, `boltscrewnailnc.com` and `boltscrewnail.net` also looked
free if you prefer one of those. Cost: **~$10–12/year**, DNS free.

---

## 3. Order of operations

The order matters more than the steps. **Domain first, deletion last.**

### Step 1 — Buy the domain (10 min, costs ~$12/yr)

- Registrar: **Cloudflare Registrar** (sells at cost, free DNS, free email routing)
  or Namecheap. Avoid "free domain" bundles that charge for DNS or renewal.
- Do **not** buy hosting, email plans, or SSL — Vercel and Cloudflare cover those.

### Step 2 — Attach the domain to the live Vercel project (15 min)

1. Vercel → project **`boltscrewnail2-2`** (the correct one) → Settings → Domains.
2. Add `boltscrewnail.com` and `www.boltscrewnail.com`.
3. At Cloudflare DNS, add exactly what Vercel shows:
   - `A  @  76.76.21.21` (Vercel's current apex IP — use whatever the dashboard displays)
   - `CNAME  www  cname.vercel-dns.com`
   - Both **DNS only** (grey cloud), not proxied, until Vercel validates.
4. Set `boltscrewnail.com` as **primary**; Vercel then 308-redirects `www` to it.
5. Test before touching anything else: `/`, `/shop.html`, `/api/products`,
   one `/api/img?…` URL, one product popup, one order draft.

**Nothing breaks at this step** — the old `vercel.app` URLs keep working.

### Step 3 — Disconnect the old Vercel project (5 min)

- Vercel → `boltscrewnails2-1` → Settings → Git → **Disconnect**.
- Leave the project in place for **2 weeks**. If nothing depended on it, delete it.
- Before deleting: confirm it has **no domain attached** and that its env vars are
  already copied (§4).

> Deleting a project destroys its deployments, its environment variables, and any
> domain still pointing at it. That is why this is last.

### Step 4 — Rename the repo (5 min)

- GitHub → `BoltscrewNail2-1` → Settings → rename to **`boltscrewnail`**.
- GitHub redirects old URLs, so nothing breaks, but update the local remote:
  `git remote set-url origin https://github.com/SinSamuel/boltscrewnail.git`
- Set the repo **homepage** to `https://boltscrewnail.com`, add description and
  topics. Verify the next Vercel deploy still triggers (Vercel tracks the repo by
  ID, not name — but confirm with one push).

### Step 5 — Update every place that names the old URL (20 min)

- `index.html` / `shop.html`: canonical links, Open Graph URLs, structured data.
- The repo homepage field, the GitHub profile README.
- Google Business Profile, invoices, email signature, truck signage, business cards.
- Anywhere the shop currently prints `boltscrewnails2-1.vercel.app`.

### Step 6 — Local machine cleanup (15 min)

1. Copy `.env.local` out of the Desktop folder to a safe place.
2. Delete `C:\Users\tatia\Desktop\boltscrewnails2.0` (it is stale and diverged —
   nothing unique lives in it except that env file).
3. Fresh clone: `git clone https://github.com/SinSamuel/boltscrewnail.git`
4. Put `.env.local` back, `npm install --omit=dev`, run
   `$env:PORT=3001; node --env-file=.env.local scripts/dev-server.mjs`.
5. Remove leftover git worktrees: `git worktree list`, then `git worktree prune`.

### Step 7 — Archive the unrelated repo (2 min)

- `blueELD-backend` → Settings → **Archive repository**. History stays, nothing is
  lost, and it stops appearing in searches.
- Leave `hugo-abconstruction` alone unless it is a dead project — that is a
  different business with its own site.

---

## 4. Environment variables — the detail that bites

Vercel env vars **do not copy** between projects. Before deleting anything, open
the old project → Settings → Environment Variables and copy every key to the keeper
project (Production + Preview). Expected keys today:

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
DISCORD_WEBHOOK_URL
TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
```
…plus the voice-agent keys once Phase 0 starts (see `VOICE-AGENT.md` §11).

Keep `.env.example` in sync so a fresh clone always knows what it needs.

---

## 5. What I need from you

1. **Vercel access.** Run `vercel login` in this folder (or create a token at
   vercel.com/account/tokens and paste it) so I can inventory every project, list
   their domains and env vars, and do the safe parts myself.
2. **Domain name** — confirm `boltscrewnail.com`, or pick another. Then you buy it
   (payment is yours); I'll wire it up.
3. **OK to rename the repo** to `boltscrewnail`?
4. **Are `hugo-abconstruction` and `blueELD-backend` live?** Archive or keep.
5. **Which Gmail address** should `orders@boltscrewnail.com` forward to for now?

---

## 6. Why this is worth doing before the phone agent

- **10DLC registration** asks for a business website on a matching domain. A
  `vercel.app` URL gets extra scrutiny; a real domain does not.
- **Email 24/7** needs a domain, period. Cloudflare Email Routing is free and can
  forward to Gmail *and* to `/api/email/inbound` at the same time, so the bot and
  Sam can share one inbox.
- **One project** means one set of env vars, one deploy status, one analytics view —
  and no repeat of "which site is live?".
- **One repo** means the stale Desktop copy stops being a candidate source of truth.

---

## 7. Verification checklist

- [ ] `https://boltscrewnail.com` loads the shop, valid certificate
- [ ] `https://www.boltscrewnail.com` redirects to the apex (or vice versa, deliberate)
- [ ] `/shop.html` renders 20 products, images load through `/api/img`
- [ ] Product popup opens full-screen, background does not scroll
- [ ] `POST /api/order` still creates a draft invoice
- [ ] Stripe webhook still receives events (check Stripe dashboard → Webhooks)
- [ ] Old `vercel.app` URLs either redirect or are retired on purpose
- [ ] `git push` to `main` triggers exactly **one** successful Vercel deployment
- [ ] `orders@boltscrewnail.com` delivers to the chosen inbox
- [ ] Repo homepage, Google Business Profile and site canonicals all show the domain
