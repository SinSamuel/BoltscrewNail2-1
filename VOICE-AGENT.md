# BOLTSCREWNAIL — AI Phone Agent Build Plan

**Goal:** a robot that answers the shop line, talks with customers in English and
Spanish **in Sam's own cloned voice**, looks up real catalog/prices/stock, and
sends text messages.

**Status:** planning. Nothing is built yet. This document is the plan we execute
against; prices and product names were checked in **November 2026** and should be
re-verified at signup.

---

## 1. Scope — what v1 does and does not do

### v1 (first release)

| # | Capability | Detail |
|---|---|---|
| 1 | **Answer inbound calls** | Picks up 24/7 or only after hours (config), answers in the caller's language |
| 2 | **English ⇄ Spanish** | One agent that detects the language from the first sentence and stays in it; switches if the caller does |
| 3 | **Sam's cloned voice** | Both languages use the same cloned voice |
| 4 | **Answer shop questions** | Hours, location, minimums, delivery/pickup, what we carry, lead times |
| 5 | **Live catalog lookup** | "Do you have 3-inch deck screws?" → reads the real price and stock from Stripe |
| 6 | **Take an order** | Collects items + quantities, reads the total back, creates the same **draft Stripe invoice** the website makes |
| 7 | **Send SMS** | Order summary to the caller, quote requests to Sam, missed-call text-back |
| 8 | **Transfer to a human** | Warm transfer to Sam's cell when the caller asks, or when the bot is unsure |
| 9 | **Log everything** | Transcript + summary + recording link in one place per call |

### Explicitly **not** in v1

- No card payments on the phone (same as the website — invoices only).
- No outbound cold-calling / telemarketing (compliance risk, see §10).
- No promises on delivery dates it can't verify.
- No guessing prices or stock — if the catalog call fails, it says so and offers a human.

### v2 ideas (later)

Message-based ordering, WhatsApp, voicemail transcription + auto-reply, Spanish
outbound follow-ups, call analytics dashboard in the admin area.

---

## 2. Recommended stack

Everything below is a **managed service with an API**, so the build is mostly
configuration + a handful of endpoints on the existing Vercel backend.

| Layer | Choice | Why | Cost (list, Nov 2026) |
|---|---|---|---|
| **Telephony + SMS** | **Twilio** (US local number) | Own the number, works with any AI vendor, 2-way SMS included | $1.15/mo per number; inbound voice $0.0085/min; SMS $0.0083 + ~$0.004 carrier fee per segment |
| **Voice agent brain** | **ElevenLabs Agents** | Native voice cloning, 74 languages incl. Spanish, built-in phone + SMS channel, tool/webhook calls, transcripts | $6/mo Starter (75 min) → $22 Creator (275 min) → $99 Pro (1,238 min); extra minutes $0.08; SMS $0.003/msg |
| **LLM** | Model chosen inside ElevenLabs (or bring our own key) | Handles reasoning + tool calls; can swap without changing voice | Billed on top; budget ~$0.01–0.03/min |
| **Our backend** | Existing Vercel functions | Reuse `/api/products`, `/api/order`, `/api/loyalty` | already paid |
| **Storage** | Vercel Postgres / Upstash Redis / Supabase | Calls, transcripts, leads, SMS log | $0–20/mo |

**Why ElevenLabs over the alternatives**

| Option | Problem for us |
|---|---|
| OpenAI Realtime API | Excellent latency, but **no voice cloning** — only preset voices. Disqualifying. |
| Twilio ConversationRelay | Gives raw audio plumbing; we'd still need STT + LLM + TTS + orchestration (weeks of work) |
| Vapi / Retell / Bland | Great products, but they add a middle layer *on top of* ElevenLabs anyway; more moving parts, less direct control of the voice |
| Building it ourselves (Twilio Media Streams + Whisper + LLM + cloned TTS) | Full control, but 4–6× the build time and we'd own all the latency problems |

> Rule of thumb: **the vendor only supplies ears, mouth and brain.** Prices,
> stock, orders and texts stay in *our* system, so nothing can drift out of sync
> with the website.

---

## 3. How a call flows

```
Caller dials the business number
        │
        ▼
Existing line forwards to the Twilio number        ← keeps the current number
        │
        ▼
Twilio Voice  ──►  ElevenLabs Agent  ──►  tools (HTTPS)  ──►  our Vercel API
        ▲                │                                   ├── /api/products
        │                │                                   ├── /api/order
        └── audio ◄──────┘  (cloned voice, EN/ES)            ├── /api/loyalty
                                                             └── /api/voice/*
        │
        ▼
Post-call webhook  ──►  /api/voice/postcall   (transcript, summary, SMS, owner alert)
```

Numbered:

1. Caller dials the shop. The carrier forwards to the Twilio number (no number porting needed for v1).
2. Twilio streams the call to the ElevenLabs agent.
3. Agent greets in English, then follows the caller's language.
4. When the caller asks something factual, the agent calls a **tool** on our API and speaks the result.
5. If the caller wants a person, the agent transfers the live call to Sam's cell.
6. When the call ends, ElevenLabs posts the transcript to our webhook; we store it, text the caller a summary, and alert Sam if a quote/order needs attention.

**Latency target:** first response under ~1 s, mid-call turns under ~800 ms. That
is why we use the low-latency ("flash") speech model and keep prompts short.

---

## 4. The four customer touchpoints

| Touchpoint | Trigger | What happens |
|---|---|---|
| **Inbound call** | Someone dials the number | Bot answers; full conversation |
| **Missed-call text-back** | Call comes in but the bot/line fails, or caller hangs up early | Automatic SMS: "Sorry we missed you — what do you need?" (highest-ROI feature for a supplier) |
| **Inbound SMS** | Customer replies to any of our texts | Agent answers by text using the same catalog tools |
| **Outbound SMS** | Order created, quote request, after-call follow-up | Templated, not conversational |

---

## 5. Voice: cloning and bilingual behaviour

### 5.1 Clone levels

| Level | Plan | Source audio needed | Quality | Use |
|---|---|---|---|---|
| **Instant clone** | Starter ($6/mo) | 1–3 minutes | good | Day-1 pilot |
| **Professional clone** | Creator ($22/mo) | **30+ min** clean speech | near-indistinguishable | Production |

Plan: start with Instant so we can test the whole flow the same day, then record
the 30-minute set and switch the agent to the Professional clone before launch.
Keep the clone in a workspace only Sam controls, with 2FA on the account.

### 5.2 Bilingual strategy

One agent, **not** two. Reasons: one prompt to maintain, one set of tools, and a
caller who says "hola" and then switches to English doesn't fall off a cliff.

- Auto language detection on the first turn; reply in that language.
- If the caller switches mid-call, switch with them within one turn.
- Fixed bilingual greeting: *"Bolt Screw Nail, this is Sam's assistant — how can I help?"* / *"Bolt Screw Nail, le habla el asistente de Sam — ¿en qué le puedo ayudar?"*
- Numbers, part numbers, prices and addresses are read **digits-first** in both languages ("three fifty, three dollars fifty" / "tres con cincuenta").
- If the caller's language isn't English or Spanish, apologize once in English and offer a transfer — do not improvise a third language.

### 5.3 Recording the clone (do this once, properly)

**Session setup**

- Quiet room, no HVAC, no music, soft furnishings if possible. Phone-booth quiet beats a big empty room.
- USB or XLR mic, 20–30 cm away, slightly off-axis to avoid plosives.
- Record **WAV, 44.1 kHz, mono, 24-bit**. No noise reduction, no compression, no reverb — the vendor does that.
- Peaks around −12 dBFS, never clipping. Do a 10-second test and listen back on headphones.
- Read **naturally**, like you're on the phone — not like an audiobook. Small pauses are good.

**What to read (~35 min total, 6 blocks)**

1. **Everyday phone lines** (5 min) — greetings, hold phrases, price read-backs, spelling back an email.
2. **Product vocabulary** (8 min) — read the catalog out loud: *"3-1/2 inch, 16 penny, 21 degree, 34 degree, .120, grade 8, galvanized, zinc, wedge anchor, Trubolt, Tapcon, deck screw, trim head, coil nail, clipped head, smooth shank, ring shank.* (Also the Spanish equivalents.)
3. **Numbers** (5 min) — prices, quantities, phone numbers, addresses, dates, tax rates, spelled-back emails.
4. **Questions and confirmations** (5 min) — *"Do you want pickup or delivery?" "Let me confirm: two boxes of 3-inch deck screws at $89.50 each, that's $179.00 before tax."*
5. **Spanish block** (8 min) — same four categories, in Spanish, in your natural Spanish accent.
6. **Free speech** (4 min) — just talk about a normal workday. This is what makes the clone sound alive.

**Consent form to keep on file** — "I confirm this is my own voice and I consent
to its use for BOLTSCREWNAIL business calls and text messages." Save with the
date; most vendors require a recorded proof-of-ownership phrase too.

---

## 6. SMS

### 6.1 Messages we'll send

| Message | Trigger | Example |
|---|---|---|
| Missed-call reply | Call not answered | "BOLTSCREWNAIL here — sorry we missed your call. Text us what you need (items + quantity) and we'll reply with price and availability." |
| Order summary | Order created on the phone | "Order #1234 — 2× 3in deck screws, 1× 16d nails. Subtotal $212.40. Reply STOP to opt out." |
| Quote acknowledgement | Caller asks for a special order | "Got it — we'll text your quote for the 1/2-in wedge anchors by tomorrow 5pm." |
| Owner alert | Any order/quote/urgent call | To Sam: caller name, number, one-line summary, link to the invoice |
| Opt-out | Customer sends STOP | Confirmation, then never message again |

### 6.2 US compliance — the part that blocks launch if we skip it

US carriers require **A2P 10DLC registration** before a business can text
customers from a 10-digit number.

1. Register the **brand** (business identity) — sole proprietor is fastest but is
   capped (roughly 3,000 messages/day, one campaign); a standard brand needs the
   business EIN/legal name.
2. Register the **campaign** (use case: "customer care + order notifications") and
   describe opt-in in the form.
3. Wait for carrier approval — **typically 1–3 weeks**, sometimes longer if the
   form is vague. Start this on day 1, in parallel with the voice work.
4. Costs: one-time brand + campaign fees (roughly $4–$50 depending on brand type)
   plus a small monthly campaign fee; verify current numbers on Twilio's A2P 10DLC
   pages before filing.

**Every message must include** the business name, what it's about, and
"Reply STOP to opt out / HELP for help". Keep the opt-out list sacred — never
message a number that sent STOP.

**Opt-in at the source:** add a checkbox on the website order form ("Text me order
updates") and log the timestamp + IP; on the phone, the bot asks. This protects us
in a TCPA complaint and is required for campaign approval.

---

## 7. Wiring into the existing site

### 7.1 What we reuse (no changes)

| Endpoint | Used for |
|---|---|
| `GET /api/products` | Product names, prices, variants, stock |
| `POST /api/order` | Creates the same draft Stripe invoice the website creates |
| `GET /api/loyalty?phone=` | Look up the caller's loyalty tier from caller ID |
| `POST /api/webhook` | Stock decrement when the invoice is sent |

> Because phone orders land as **draft Stripe invoices**, they appear in the exact
> same end-of-day batch Sam already reviews. Nothing new to learn.

### 7.2 New endpoints to build

| Endpoint | Purpose |
|---|---|
| `GET /api/voice/catalog?q=` | Slim, speech-friendly search: name, variant, price, stock, in-stock flag |
| `POST /api/voice/lookup` | Resolve a spoken item to a `priceId` (handles "three inch deck screws" → exact variant) |
| `POST /api/voice/order` | Wraps `/api/order` with phone-specific rules (see below) |
| `POST /api/voice/tools` | Single dispatcher the agent calls; routes to the three above |
| `POST /api/voice/postcall` | Receives transcript + summary at hang-up; sends SMS, alerts Sam, stores the call |
| `POST /api/twilio/voice` | TwiML for forwarding, warm transfer, missed-call fallback |
| `POST /api/twilio/sms` | Inbound SMS: STOP/HELP handling, then hand to the agent |

### 7.3 One real design problem to solve: `/api/order` requires an email

`/api/order` rejects an order without `customer.email` and `delivery.address`. Over
the phone, email is the awkward part (spelling it back is error-prone).

Proposed: add an optional `channel: "phone"` to `/api/order` that allows a missing
email and marks the invoice metadata `channel=phone`, `customerPhone=…`. Then the
bot texts the invoice link to the number it already has. Address is still required
— read it back **once**, slowly, and confirm before creating the invoice.

Everything else (stock validation, tax, stock decrement on send) stays identical.

### 7.4 Tool contract (what the agent can call)

```jsonc
// POST /api/voice/tools
{ "tool": "search_catalog", "args": { "query": "3 inch deck screws" } }
→ { "matches": [{ "name": "…", "priceId": "price_…", "variant": "3 in",
                  "price": 24.99, "stock": 41, "inStock": true }] }

{ "tool": "create_order", "args": {
    "lines": [{ "priceId": "price_…", "qty": 2 }],
    "customer": { "name": "…", "phone": "+1919…" },
    "delivery": { "address": "…", "method": "pickup" } } }
→ { "ok": true, "invoiceId": "in_…", "total": 212.40 }

{ "tool": "send_sms", "args": { "to": "+1919…", "template": "order_summary", "vars": {…} } }
{ "tool": "transfer_to_owner", "args": { "reason": "custom quote" } }
{ "tool": "log_lead", "args": { "name": "…", "phone": "…", "need": "…" } }
```

Rules baked into the prompt:

- Never state a price or stock number that didn't come from a tool result.
- Never create an order without reading the full total back and getting a clear "yes".
- If two tool calls fail in a row, apologize and transfer.
- Never invent a delivery date — quote the policy, not a promise.

### 7.5 Data we store

```
calls(id, twilio_call_sid, from_number, language, started_at, duration_s,
      transcript_json, summary, intent, outcome, recording_url)
leads(id, call_id, name, phone, need, status, created_at)
messages(id, direction, to_number, body, template, provider_id, status, created_at)
optouts(phone, source, created_at)   -- hard block list
```

---

## 8. Phases and acceptance criteria

**Phase 0 — Accounts & registration (days 1–3, mostly waiting)**

- [ ] Twilio account + US local number bought
- [ ] 10DLC brand + campaign submitted (this is the long pole — start now)
- [ ] ElevenLabs account, workspace, Instant clone of Sam's voice
- [ ] Business facts written down: hours, address, pickup/delivery rules, minimums, payment terms, what we *don't* do
- **Done when:** a test call to the Twilio number rings a phone.

**Phase 1 — Talking skeleton (week 1)**

- [ ] Agent answers, greets bilingually, and can hold a 2-minute conversation about hours/location
- [ ] Language detection works both ways
- [ ] Transfer to Sam works
- **Done when:** 10 scripted test calls pass (5 EN, 5 ES) with no dead air over 2 s.

**Phase 2 — Catalog brain (week 2)**

- [ ] `/api/voice/catalog`, `/api/voice/lookup`, `/api/voice/tools` live
- [ ] Agent answers price/stock questions correctly for 20 random products
- [ ] Says "let me check" instead of guessing when a tool is slow
- **Done when:** 30 blind questions (mixed EN/ES) return the same answer the website shows.

**Phase 3 — Orders + SMS (week 3)**

- [ ] `channel: "phone"` order path
- [ ] Total read-back + confirmation
- [ ] Draft invoice appears in Stripe and in the end-of-day batch
- [ ] Order summary SMS arrives within 10 s
- [ ] Missed-call text-back working
- **Done when:** 5 real test orders (staff phones) complete end-to-end with correct totals.

**Phase 4 — Polish + soft launch (week 4)**

- [ ] Professional voice clone swapped in
- [ ] Prompt tuned from real transcripts; barge-in and interruption handled
- [ ] After-hours-only routing for week 1 of launch, then review
- [ ] Monitoring + weekly transcript review
- **Done when:** one week of production calls with zero wrong prices and zero missed orders.

---

## 9. Cost model

List prices, Nov 2026 — re-verify before committing.

| Item | Rate |
|---|---|
| Twilio number | $1.15/mo |
| Twilio inbound voice | $0.0085/min |
| Twilio SMS out | $0.0083/segment + ~$0.004 carrier fee |
| ElevenLabs Agents plan | $22/mo (Creator, 275 min) or $99/mo (Pro, 1,238 min) |
| ElevenLabs extra minutes | $0.08/min |
| ElevenLabs SMS | $0.003/message |
| LLM | ~$0.01–0.03/min |
| 10DLC | one-time brand/campaign fee + small monthly campaign fee |

**Worked example — 300 calls/month × 3 min = 900 minutes**

| Line | Monthly |
|---|---|
| ElevenLabs (Creator 275 min + 625 extra × $0.08) | $72 |
| LLM (~900 min × $0.02) | $18 |
| Twilio voice (900 × $0.0085) | $7.65 |
| Twilio number | $1.15 |
| 400 SMS (Twilio + ElevenLabs) | ~$7 |
| 10DLC campaign fee | ~$2–10 |
| **Total** | **≈ $108–116/mo** |

Pilot month (≈60 min of calls) is **under $15** all-in.

---

## 10. Compliance and safety checklist

- [ ] **AI disclosure.** Open with "You're speaking with an automated assistant" (or Spanish equivalent). Several states require bots to identify themselves; it also cuts hostile reactions.
- [ ] **Recording notice.** NC is one-party consent, but callers may be in two-party states — always play "This call may be recorded" and never disable it.
- [ ] **Transcript retention policy.** Keep 90 days by default, longer only for orders/quotes. Provide deletion on request.
- [ ] **TCPA for SMS.** Opt-in recorded, STOP honored instantly and permanently, quiet hours respected (no marketing texts before 8am/after 9pm local).
- [ ] **No outbound telemarketing** in v1. Cold outbound calls carry heavy penalties; text-back to an inbound caller is a different, defensible category.
- [ ] **No payment data on the phone.** Never read back or accept card numbers. Invoices only, same as the site.
- [ ] **Secrets.** Twilio/ElevenLabs/Stripe keys live in Vercel env vars only — never in `shop.js` or the browser bundle.
- [ ] **Webhook verification.** Validate Twilio's `X-Twilio-Signature` and ElevenLabs' signed webhooks; reject anything else.
- [ ] **Voice clone ownership.** Written consent on file; clone stored in an account with 2FA; never expose the voice ID publicly.

---

## 11. Environment variables to add

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+1...
OWNER_CELL=+1...                 # warm-transfer target
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_VOICE_ID=
ELEVENLABS_WEBHOOK_SECRET=
VOICE_TOOLS_SECRET=              # shared secret on tool calls
BUSINESS_HOURS_JSON=             # {"mon":["08:00","17:00"], ...}
AFTER_HOURS_ONLY=false
```

Put them in `.env.local` for development and in **Vercel → Settings → Environment
Variables** for production. Never commit `.env.local` (already git-ignored).

---

## 12. Test plan

| Area | Test | Pass condition |
|---|---|---|
| Language | Call in Spanish only | Stays Spanish the whole call |
| Language | Start Spanish, switch to English | Switches within one turn |
| Accuracy | 30 blind price/stock questions | Matches website exactly |
| Numbers | "two boxes", "2.5 inch", "$179.50" | Read back correctly, no digit drift |
| Order | Full phone order to pickup | Draft invoice created, total correct |
| Order | Caller says "no" at confirmation | No invoice created |
| Interruption | Talk over the bot | Bot stops, listens, continues |
| Silence | 8 s of silence | Prompts once, then offers transfer |
| Failure | Kill `/api/products` | Bot says it can't check and offers a human — never invents |
| Transfer | Ask for Sam | Live call lands on Sam's cell with context |
| SMS | Order placed | Summary SMS < 10 s, correct total |
| SMS | Reply STOP | Confirmed, then never contacted again |
| Missed call | Hang up after 1 ring | Text-back within 30 s |

---

## 13. Operations after launch

- **Daily (2 min):** skim the call list — intent, outcome, any "unknown" answers.
- **Weekly (15 min):** read 5 transcripts end-to-end (2 Spanish); add missing facts to the knowledge base, fix one prompt line.
- **Monthly:** check minutes vs plan, SMS delivery rates, and any carrier filtering notices.
- **Alerts to Sam:** every order, every quote request, every transfer, and any call where the bot said "I'm not sure" more than twice.

---

## 14. Decisions needed from Sam

Answer these and we start Phase 0 the same day.

1. **Existing number** — keep it and *forward* to the new AI number (fast, reversible), or **port** it to Twilio (cleaner long-term, 1–2 weeks, brief outage risk)?
2. **When does the bot answer?** 24/7, after-hours only, or "ring Sam 3 times first, then the bot"?
3. **Can it take orders on the phone**, or only quote + capture a lead?
4. **Pickup vs delivery** — which is offered, and what are the rules/minimums the bot must state?
5. **Spanish dialect** — which Spanish should it match (neutral Latin American, Mexican, Puerto Rican, other)?
6. **SMS sender** — reuse the voice number for texts (simplest), or get a separate one?
7. **Budget ceiling** for the first 3 months (so we choose Starter vs Creator vs Pro).
8. **Business identity for 10DLC** — legal business name + EIN (or sole proprietor with SSN), and the address to register.
9. **Who is the human backup**, and at what number?
10. **Do you want call recordings stored**, and for how long?

---

## 15. References

- ElevenLabs Agents pricing — https://elevenlabs.io/pricing/agents
- ElevenLabs voice cloning docs — https://elevenlabs.io/docs/voices/voice-cloning
- Twilio Voice pricing (US) — https://www.twilio.com/en-us/voice/pricing/us
- Twilio SMS pricing (US) — https://www.twilio.com/en-us/sms/pricing/us
- Twilio A2P 10DLC — https://www.twilio.com/en-us/phone-numbers/a2p-10dlc
- A2P 10DLC fees — https://help.twilio.com/articles/1260803965530

---

### Suggested repo layout (built during the phases)

```
api/
  voice/
    catalog.js        # speech-friendly product search
    lookup.js         # spoken item → priceId
    order.js          # phone-order wrapper around /api/order
    tools.js          # single dispatcher the agent calls
    postcall.js        # transcript → SMS + owner alert + storage
  twilio/
    voice.js          # TwiML: forward, warm transfer, missed-call fallback
    sms.js            # inbound SMS, STOP/HELP, agent hand-off
lib/
  voice/
    prompts.js        # EN/ES system prompt + guardrails
    templates.js      # SMS wording
    catalog-speech.js # numbers/dates spelled for speech
```
