# BOLTSCREWNAIL — AI Phone Agent Build Plan

**Goal:** a robot that answers the shop line, talks with customers in English and
Spanish **in Sam's own cloned voice**, looks up real catalog/prices/stock, and
sends text messages.

**Status:** planning. Nothing is built yet. This document is the plan we execute
against; prices and product names were checked in **November 2026** and should be
re-verified at signup.

> **Locked by Sam (Nov 2026)**
>
> | Decision | Answer |
> |---|---|
> | **Calls** | Answered **only during working hours**. No night calls. |
> | **Texts** | Answered **until 9 pm** (10 pm max — see §6.3 for why 9 is the safer line). |
> | **Email** | Answered **24/7**. |
> | **Spanish** | **Mexican, clear northern Baja** (Tijuana / Mexicali), at Sam's own tone and pace — §5.3. |
> | **Number** | Sam's existing **Google Voice** number. §2.1 covers the one hard constraint on that. |
>
> Everything else is still open — see §14.

---

## 1. Scope — what v1 does and does not do

### v1 (first release)

| # | Capability | Detail |
|---|---|---|
| 1 | **Answer inbound calls** | **Working hours only** (see §4); answers in the caller's language |
| 2 | **English ⇄ Spanish** | One agent that detects the language from the first sentence and stays in it; switches if the caller does |
| 3 | **Sam's cloned voice** | Both languages use the same cloned voice |
| 4 | **Answer shop questions** | Hours, location, minimums, delivery/pickup, what we carry, lead times |
| 5 | **Live catalog lookup** | "Do you have 3-inch deck screws?" → reads the real price and stock from Stripe |
| 6 | **Take an order** | Collects items + quantities, reads the total back, creates the same **draft Stripe invoice** the website makes |
| 7 | **Send SMS** | Order summary to the caller, quote requests to Sam, missed-call text-back — replies until 9 pm (§6.3) |
| 8 | **Answer email 24/7** | A monitored shop inbox (`orders@…`) that replies day and night with the same catalog tools (§6.4) |
| 9 | **Transfer to a human** | Warm transfer to Sam's cell when the caller asks, or when the bot is unsure |
| 10 | **Log everything** | Transcript + summary + recording link in one place per call / email thread |

### Explicitly **not** in v1

- No card payments on the phone (same as the website — invoices only).
- No outbound cold-calling / telemarketing (compliance risk, see §10).
- No outbound email marketing or drip campaigns — inbound replies only.
- No promises on delivery dates it can't verify.
- No guessing prices or stock — if the catalog call fails, it says so and offers a human.
- No calls outside working hours. After hours the line takes a voicemail and texts back
  (inside the SMS window) instead of answering.

### v2 ideas (later)

Message-based ordering, WhatsApp, Spanish outbound follow-ups, call + email
analytics in the admin area, automatic reorder reminders for repeat contractors.

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
| **Email** | **Resend** (already used for notifications) + inbound webhook | 24/7 inbox, same tools, proper threading; no new vendor to learn | free tier covers this volume; domain ~$12/yr |
| **Storage** | Vercel Postgres / Upstash Redis / Supabase | Calls, transcripts, leads, SMS queue, email threads | $0–20/mo |

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

### 2.1 The phone number: what a Google Voice number can and cannot do

Sam already has a Google Voice (GV) number and wants to keep it. Here is the
constraint, straight from Google's own help page:

> "Forwarding calls from your Google Voice number to an automated system is
> unsupported. Sign up for Google Workspace to use an auto attendant if you need
> to forward calls to an automated system."
> — Google Voice Help, *Set up your phone to make & receive calls*

That kills the easy plan ("keep GV, forward it to the bot"). Three consequences:

1. **GV cannot sit in front of the robot.** Its forwarding is meant to ring a
   human phone (up to 6 linked numbers), not to hand a call to a PBX or an AI agent.
2. **Texts to a GV number never reach Twilio.** GV keeps its own messaging. So
   STOP handling, order-summary texts, and A2P 10DLC registration only work on a
   number Twilio actually owns.
3. **The bot has to own the number customers dial.** There are two ways to get there.

| | **Path A — port the GV number to Twilio** (recommended) | **Path B — new Twilio number** |
|---|---|---|
| Customer experience | Same number they already have | Number changes; old GV stays as a human line |
| What Sam does | Google Voice → Settings → Account → **Unlock** ($3; free if the number was originally ported *into* GV), then submit a port request in Twilio | Buy a local number in Twilio (~$1.15/mo) |
| Paperwork | 10-digit GV number as the "account number", GV voicemail PIN as the PIN, account-holder name + address exactly as on the GV account, and the "Number unlocked" screenshot saved as a **PDF** | none |
| Timeline | **5–15 business days**, up to 4 weeks if the losing carrier rejects it | minutes |
| Result | Voice **and** SMS land in Twilio; 10DLC attaches to the same number | Same, but on a new number |
| Risk | A port can be rejected if name/address/PIN don't match. Keep GV active and **do not delete the number** until the port completes | None, but customers must learn the new number |

**Plan:** submit the port in Phase 0 (it runs in the background while we build),
run the bot on a cheap temporary Twilio number for testing, and keep the GV
account untouched until the port lands. If the port is rejected, fall back to
Path B and put the GV number on the website as the human line.

**Two things to confirm before filing** (§14): whether the shop's public number
(919 789 1348) *is* the GV number, and whether the GV account is a personal one
(Workspace GV is a different, paid product with a real auto-attendant).

> Footnote worth knowing: Google warns that "some third-party services may not
> accept phone numbers which originated from Google Voice". Twilio does port GV
> numbers (their help article is titled *"Is It Possible to Port a Google Voice
> Number Into Twilio?"*), but a portability check is what decides it — not Google.

---

## 3. How a call flows

```
Caller dials the business number (the GV number, ported to Twilio in Phase 0)
        │
        ▼
Twilio Voice ──► hours gate ── inside working hours ──► ElevenLabs Agent ──► tools ──► our Vercel API
                    │                                     ▲    │             ├── /api/products
                    │                                     │    │             ├── /api/order
                    └── outside hours ──► voicemail       │    │             ├── /api/loyalty
                         + text-back (until 9 pm)         │    │             └── /api/voice/*
                                                          └────┘  audio (EN/ES)

Post-call webhook ──► /api/voice/postcall   (transcript, summary, SMS, owner alert)

Customer email ──► inbound provider ──► /api/email/inbound ──► LLM + same tools ──► reply, 24/7
```

Numbered:

1. Caller dials the shop. The number is a Twilio number (ported from Google Voice in Phase 0), so there is **no forwarding hop** and no unsupported GV→automation path.
2. Twilio checks the clock **before** anything else. Inside working hours → the agent. Outside → a short voicemail greeting, then an automatic text-back (queued to 8 am if it is past 9 pm).
3. Twilio streams the call to the ElevenLabs agent.
4. Agent greets in English, then follows the caller's language.
5. When the caller asks something factual, the agent calls a **tool** on our API and speaks the result.
6. If the caller wants a person, the agent transfers the live call to Sam's cell.
7. When the call ends, ElevenLabs posts the transcript to our webhook; we store it, text the caller a summary, and alert Sam if a quote/order needs attention.
8. Email is a separate 24/7 track with the same tools and the same invoice endpoint — see §6.4.

**Latency target:** first response under ~1 s, mid-call turns under ~800 ms. That
is why we use the low-latency ("flash") speech model and keep prompts short.

---

## 4. Channels, hours and touchpoints

All times are **America/New_York** (Raleigh). The hours gate is the single most
important config in the whole build: it is what stops the robot from answering at
2 am and what keeps the text line inside TCPA quiet hours.

| Channel | Open | Who answers | Outside the window |
|---|---|---|---|
| **Voice** | **Working hours only** — `Mon–Fri 07:00–17:00`, `Sat 08:00–14:00` *(to confirm)* | ElevenLabs agent, EN/ES | Voicemail greeting (bilingual) + text-back. Never a bot conversation. |
| **SMS** | **08:00–21:00 daily** (10 pm max — §6.3) | Bot, same tools | Message is queued and sent at 08:00. Exception: STOP / HELP is honoured instantly, 24/7. |
| **Email** | **24/7** | Bot + same tools; human follow-up next morning when needed | Nothing closes — first reply target 15 min, any hour. |
| **Website form** | 24/7 | Unchanged (`/api/order`) | n/a |

**Why these three windows differ:** a phone call demands an immediate human-quality
conversation, so it only runs when a human could back it up. A text is async and
low-risk, so it can run into the evening. Email is expected to be slow, so
overnight replies read as good service rather than as a robot calling at midnight.

**Boundary behaviour (must be exact):**

- 16:59 call → agent answers. 17:00 call → voicemail + text-back.
- 20:59 text → answered now. 21:01 text → queued, sent 08:00, with "sorry for the
  late reply" only if the customer texted after hours.
- Any voicemail left after 21:00 → the text-back waits until 08:00.
- A call transferred to Sam at 16:55 still rings his cell even after 17:00.
- Holidays: same rules as a closed day (voicemail + queued text). Holiday list in config.

> The homepage advertises **Saturday & Sunday delivery**, so weekend calls are a
> real decision, not an afterthought. If Sunday delivery is live, either the bot
> answers Sunday morning or those customers get a voicemail + text-back.

**The customer touchpoints**

| Touchpoint | Trigger | What happens |
|---|---|---|
| **Inbound call** | Someone dials during working hours | Bot answers; full conversation |
| **Missed-call text-back** | Call outside hours, or caller hangs up early | Automatic SMS: "Sorry we missed you — what do you need?" (queued if past 9 pm) |
| **Inbound SMS** | Customer replies to any of our texts | Agent answers by text using the same catalog tools |
| **Outbound SMS** | Order created, quote request, after-call follow-up | Templated, not conversational |
| **Inbound email** | Anything sent to the shop inbox | Bot replies 24/7, threads properly, escalates to Sam when needed |

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

### 5.3 Spanish: Mexican, clear northern Baja

Target is **Mexican Spanish from the northern Baja border** — Tijuana, Mexicali,
Ensenada — clear and direct, not Spain, not Mexico City, not Caribbean. It has to
sound like Sam talking, not like a translated call centre.

Two layers do the work, and they are separate problems:

| Layer | Where it comes from | What we control |
|---|---|---|
| **Accent + speed** | The cloned voice, trained on the Spanish audio Sam records | Recording quality and Sam reading naturally (§5.4) — *not* the prompt |
| **Words + rhythm** | The agent prompt and the catalog speech helpers | Rules below, plus a QA pass with Spanish-speaking customers |

**Address and tone**

- Default to **usted** with customers; switch to **tú** only if the customer does first.
- Warm and practical, not chatty. No "¡Excelente pregunta!" filler.
- Short sentences. One question at a time.
- Never `vosotros`, never Spain vocabulary.

**Vocabulary that must be right**

| Say | Not | Why |
|---|---|---|
| **tornillo** (screw), **clavo** (nail), **tuerca** (nut), **arandela** (washer), **ancla** (anchor), **taquete** (wall anchor) | pija, tornillo de rosca literal translations | "Pija" is vulgar in Mexico — never say it on a shop line |
| **block** / **tabique** | bloque de hormigón | "Block" is what Baja crews actually say |
| **varilla** | barra roscada (for rebar / threaded rod contexts) | Local usage |
| **troca** | camioneta (for a contractor's pickup) | Common Baja usage |
| **bodega** / **almacén** | tienda (for the warehouse) | Local usage |
| **menudeo / mayoreo** | venta al por menor / al por mayor | How contractors ask |
| **a domicilio** (delivery), **recoger en tienda** (pickup) | entrega / recolección alone | Clearer on a phone call |
| **cotización** (quote), **¿cuánto sale?** (how much) | presupuesto (Spain) | Local usage |
| **¿me lo aparta?** (hold it for me) | reservar formal | Local usage |

Keep **brand and trade names in English**: Tapcon, Trubolt, Senco, Bostitch,
deck screw, grade 8, 16 penny. That is normal code-switching in a Baja shop, and
translating them makes the bot sound foreign.

**Numbers and money**

- Always say **dólares**: "doscientos doce dólares con cuarenta" — never a bare
  number, so it can't be heard as pesos.
- Sizes in Spanish: "tres pulgadas", "media pulgada", "tres y medio"; angle in
  "grados" ("veintiún grados"); gauge as "calibre dieciséis"; grade as "grado ocho".
- Phone numbers in groups ("nueve uno nueve, siete ocho nueve, uno tres cuatro ocho"),
  never as one long number.
- Read the total **once, slowly**, then ask the customer to repeat it back. If they
  don't, read it again before creating anything.

**Pace**

Northern Baja speech is quick and clipped. The clone inherits Sam's pace from the
Spanish recording, so the fix for "too slow" is a re-record, not a speed setting.
Allow the fillers Sam actually uses ("este…", "órale", "sale", "¿mande?") — but
only the ones he really says; a filler he never uses is instantly detectable.
Never use "ahorita" to promise a time; it is vague. Say "hoy en la tarde" or
"mañana antes de las diez".

**Spanish test gate:** before launch, three Spanish-speaking contractors listen to
five recorded calls and answer one question — *"¿Se oye como alguien de la
frontera o como un robot traducido?"* Anything below 4/5 gets a prompt fix or a
re-record.

### 5.4 Recording the clone (do this once, properly)

**Session setup**

- Quiet room, no HVAC, no music, soft furnishings if possible. Phone-booth quiet beats a big empty room.
- USB or XLR mic, 20–30 cm away, slightly off-axis to avoid plosives.
- Record **WAV, 44.1 kHz, mono, 24-bit**. No noise reduction, no compression, no reverb — the vendor does that.
- Peaks around −12 dBFS, never clipping. Do a 10-second test and listen back on headphones.
- Read **naturally**, like you're on the phone — not like an audiobook. Small pauses are good.

**What to read (~40 min total, 6 blocks)**

1. **Everyday phone lines** (5 min) — greetings, hold phrases, price read-backs, spelling back an email.
2. **Product vocabulary** (8 min) — read the catalog out loud: *"3-1/2 inch, 16 penny, 21 degree, 34 degree, .120, grade 8, galvanized, zinc, wedge anchor, Trubolt, Tapcon, deck screw, trim head, coil nail, clipped head, smooth shank, ring shank.* (Also the Spanish equivalents.)
3. **Numbers** (5 min) — prices, quantities, phone numbers, addresses, dates, tax rates, spelled-back emails.
4. **Questions and confirmations** (5 min) — *"Do you want pickup or delivery?" "Let me confirm: two boxes of 3-inch deck screws at $89.50 each, that's $179.00 before tax."*
5. **Spanish block** (10–12 min) — the same four categories, in Sam's natural **Baja Spanish**, at normal talking speed. This block is what sets the Spanish accent for the whole agent: if it is read like a newscast, the bot will sound like one. Include the §5.3 vocabulary out loud (*tornillo, clavo, block, varilla, menudeo, mayoreo, a domicilio, cotización*), two price read-backs in dollars, and two full mock calls in Spanish. Do not slow down or "read carefully" — talk the way you talk to a contractor on the phone.
6. **Free speech** (4 min) — just talk about a normal workday, once in English and once in Spanish. This is what makes the clone sound alive.

Both languages must sound like the **same person in the same mood** — same energy,
same pace. If the Spanish half sounds like a different man, re-record it rather
than trying to fix it with prompt text.

**Consent form to keep on file** — "I confirm this is my own voice and I consent
to its use for BOLTSCREWNAIL business calls and text messages." Save with the
date; most vendors require a recorded proof-of-ownership phrase too.

---

## 6. Messaging: SMS until 9 pm, email 24/7

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

### 6.3 Reply hours: 08:00–21:00 (why 9 pm, not 10 pm)

- **Window: 08:00–21:00 in the recipient's local time**, derived from the area code
  with Twilio Lookup. TCPA quiet hours are 8 am–9 pm *local to the recipient*, not
  to the shop — a customer in California getting a 9:30 pm text from a Raleigh
  number is exactly the complaint scenario.
- **21:00–08:00:** nothing automated goes out **except STOP / HELP confirmations**
  (opt-out must be immediate). Everything else is queued and sent at 08:00.
- **Why not 10 pm:** 9 pm is the line regulators and carriers measure against. Even
  a transactional text at 10 pm reads as pushy and is the kind of thing that gets a
  campaign flagged. If Sam insists on 10, the only allowed exception is a reply sent
  within 15 minutes to a customer who texted us first — never an outbound template.
- **Missed-call text-back after 21:00** → queued, not sent.
- **What the bot says on the phone:** "Texts get answered until nine — email works
  any time."
- **Implementation:** a single `sendSms()` wrapper enforces the gate; nothing calls
  the Twilio API directly. Queued rows live in `message_queue(send_after, body, to,
  template)` and a cron flushes at 08:00. Internal alerts to Sam's own cell are
  exempt — that is not a customer message.

### 6.4 Email, 24/7

Email is a **new channel**, not a by-product of SMS: it needs a real mailbox, a
parse → think → reply pipeline, and its own escalation rules. ElevenLabs Agents has
no native email channel, so this runs on our Vercel backend with Resend (already in
use for notifications).

**What we need first**

1. A **domain** (e.g. `boltscrewnail.com`) — the shop currently lives on `vercel.app`,
   so there is no shop mailbox yet. ~$10–15/yr.
2. **Inbound routing** — Resend inbound, or Cloudflare Email Routing → our webhook.
3. **SPF + DKIM + DMARC** on the domain, so replies don't land in spam or get
   impersonated.

**Pipeline**

```
customer email ──► provider inbound webhook ──► /api/email/inbound
      │                                              │
      │                                    verify signature, parse text,
      │                                    thread by Message-ID/References
      │                                              │
      │                                    LLM + same tools as the phone
      │                                    (catalog, order draft, lead)
      ▼                                              ▼
  reply via Resend  ◄────────────────────  send + log + notify Sam
```

**What auto-sends, and what waits for a human**

| Email type | 24/7 auto-reply | Human follow-up |
|---|---|---|
| Hours, location, "do you carry X", price & stock | ✅ answered straight from tools | none |
| Quote request with sizes/quantities | ✅ price reply + "we'll confirm availability by 9 am" | Sam confirms |
| Order (PO or item list) | ✅ acknowledgement + draft invoice link | Sam reviews and sends it — same end-of-day batch as the website |
| Complaint, damage, refund, "urgent", "today" | ❌ draft only | Sam, first thing |
| Supplier / unknown vendor / anything with attachments | ❌ routed to Sam | Sam |

**Guardrails**

- Never open attachments or follow links (list them, don't touch them).
- Strip HTML to text before the model sees it; cap message size at 1 MB.
- Never quote a price or stock number that a tool didn't return; never promise a
  delivery date.
- Loop protection: skip `noreply@`, honour `Auto-Submitted` headers, max one
  auto-reply per sender per 12 h.
- CAN-SPAM: transactional replies stay plain; anything promotional gets the
  physical address and a working opt-out.
- First-reply target: **under 15 minutes, any hour.** Anything needing Sam is
  summarised to him at 07:00, so a 3 am order is waiting for him with a draft.

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
| `POST /api/twilio/voice` | TwiML: working-hours gate, warm transfer, voicemail fallback |
| `POST /api/twilio/sms` | Inbound SMS: STOP/HELP handling, hours gate, queueing, then hand to the agent |
| `POST /api/email/inbound` | Inbound email: verify, parse, thread, answer with tools, escalate to Sam |
| `GET /api/cron/flush-sms` | 08:00 queue flush (Vercel cron, protected by a secret) |

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
leads(id, call_id, email_thread_id, name, phone, email, need, status, created_at)
messages(id, direction, to, body, template, provider_id, status, created_at)
message_queue(id, to, body, template, send_after, sent_at)   -- after-hours SMS
optouts(phone, source, created_at)                          -- hard block list
email_threads(id, thread_key, from_email, subject, last_message_at, status)
emails(id, thread_id, direction, subject, body_text, provider_id, status, needs_human)
```

---

## 8. Phases and acceptance criteria

**Phase 0 — Accounts & registration (days 1–3, mostly waiting)**

- [ ] Twilio account + a cheap temporary US local number (used for testing only)
- [ ] **Google Voice port request submitted**: unlock the number ($3), save the
      "Number unlocked" page as a **PDF**, open the port in Twilio with the 10-digit
      GV number as account number and the GV voicemail PIN as PIN
- [ ] 10DLC **brand + campaign** submitted (this is the long pole — start now; the
      ported number gets attached once the port lands)
- [ ] ElevenLabs account, workspace, Instant clone of Sam's voice
- [ ] Domain bought + inbound email routing configured (§6.4)
- [ ] Business facts written down: **working hours + holidays**, address,
      pickup/delivery rules, minimums, payment terms, what we *don't* do
- [ ] Spanish term list agreed (§5.3) — the words Sam actually uses on the counter
- **Done when:** a test call to the temporary Twilio number rings a phone, and the
  port shows as *in progress* in Twilio.

**Phase 1 — Talking skeleton (week 1)**

- [ ] Agent answers, greets bilingually, and can hold a 2-minute conversation about hours/location
- [ ] **Working-hours gate live**: in-window → agent, out-of-window → voicemail only
- [ ] Language detection works both ways
- [ ] Transfer to Sam works (including after 17:00)
- **Done when:** 10 scripted test calls pass (5 EN, 5 ES) with no dead air over 2 s,
  and a 19:00 test call reaches voicemail instead of the agent.

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
- [ ] **SMS hours gate + 08:00 queue** working
- [ ] Missed-call text-back working (queued if past 21:00)
- **Done when:** 5 real test orders (staff phones) complete end-to-end with correct
  totals, and a 21:30 test text is delivered at 08:00 the next morning.

**Phase 4 — Polish + soft launch (week 4)**

- [ ] Professional voice clone swapped in
- [ ] Prompt tuned from real transcripts; barge-in and interruption handled
- [ ] **Spanish QA gate passed** — three Baja/Mexican Spanish speakers rate 4/5 or better (§5.3)
- [ ] Live calls restricted to the working-hours window (no after-hours bot answering)
- [ ] Monitoring + weekly transcript review
- **Done when:** one week of production calls with zero wrong prices and zero missed orders.

**Phase 5 — Email 24/7 (week 5, can run in parallel)**

- [ ] Domain, SPF/DKIM/DMARC, inbound webhook live
- [ ] Email → tool → reply loop working with correct threading
- [ ] Auto-send list and "draft only" list from §6.4 enforced
- [ ] 07:00 digest to Sam with everything that needs him
- **Done when:** a test email sent at 02:00 gets a correct, useful reply within 15
  minutes, and a complaint email is held for Sam instead of answered by the bot.

---

## 9. Cost model

List prices, Nov 2026 — re-verify before committing.

| Item | Rate |
|---|---|
| Twilio number | $1.15/mo |
| Twilio inbound voice | $0.0085/min |
| Twilio SMS out | $0.0083/segment + ~$0.004 carrier fee |
| Twilio Lookup (recipient time zone for the SMS gate) | ~$0.005/lookup |
| Domain + email | ~$12/yr domain; Resend free tier covers this volume |
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

Because voice only runs during working hours, minutes stay modest even on a busy
line — 300 three-minute calls is already a heavy week. Email adds no meaningful
cost (free tier), so the $108–116/month figure is the realistic ceiling for year one.

---

## 10. Compliance and safety checklist

- [ ] **AI disclosure.** Open with "You're speaking with an automated assistant" (or Spanish equivalent). Several states require bots to identify themselves; it also cuts hostile reactions. Email replies carry the same line in the signature.
- [ ] **Recording notice.** NC is one-party consent, but callers may be in two-party states — always play "This call may be recorded" and never disable it.
- [ ] **Transcript retention policy.** Keep 90 days by default, longer only for orders/quotes. Provide deletion on request.
- [ ] **TCPA for SMS.** Opt-in recorded, STOP honoured instantly and permanently, quiet hours respected — **08:00–21:00 in the recipient's local time** (§6.3), with a hard queue outside that window. No exceptions except STOP/HELP.
- [ ] **CAN-SPAM for email.** Real physical address in the footer, honest subject lines, working opt-out on anything promotional. Transactional replies (order status, quotes the customer asked for) stay plain and personal.
- [ ] **No outbound telemarketing** in v1. Cold outbound calls carry heavy penalties; text-back to an inbound caller is a different, defensible category.
- [ ] **No payment data on the phone.** Never read back or accept card numbers. Invoices only, same as the site.
- [ ] **Google Voice port.** Unlock before filing, keep the GV account alive until the port completes, and never delete the number mid-port — a deleted number cannot be recovered.
- [ ] **Secrets.** Twilio/ElevenLabs/Stripe/Resend keys live in Vercel env vars only — never in `shop.js` or the browser bundle.
- [ ] **Webhook verification.** Validate Twilio's `X-Twilio-Signature`, ElevenLabs' signed webhooks, and the inbound-email provider's signature; reject anything else.
- [ ] **Voice clone ownership.** Written consent on file; clone stored in an account with 2FA; never expose the voice ID publicly.

---

## 11. Environment variables to add

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+1...        # the ported GV number once it lands
OWNER_CELL=+1...                 # warm-transfer target
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_VOICE_ID=
ELEVENLABS_WEBHOOK_SECRET=
VOICE_TOOLS_SECRET=              # shared secret on tool calls

# Hours (America/New_York unless noted)
BUSINESS_TZ=America/New_York
BUSINESS_HOURS_JSON=             # {"mon":["07:00","17:00"], ... }
HOLIDAYS_JSON=                   # ["2027-01-01", ...]
SMS_WINDOW=08:00-21:00           # recipient-local; enforced in sendSms()
SMS_QUEUE_CRON_SECRET=

# Email (24/7)
EMAIL_DOMAIN=boltscrewnail.com
EMAIL_INBOUND_SECRET=
EMAIL_FROM=orders@boltscrewnail.com
RESEND_API_KEY=                  # already used by lib/notifications.js
```

Put them in `.env.local` for development and in **Vercel → Settings → Environment
Variables** for production. Never commit `.env.local` (already git-ignored).

---

## 12. Test plan

| Area | Test | Pass condition |
|---|---|---|
| Language | Call in Spanish only | Stays Mexican Spanish the whole call |
| Language | Start Spanish, switch to English | Switches within one turn |
| Dialect | Customer uses *block, varilla, menudeo, a domicilio, troca* | Bot understands and answers in the same register |
| Dialect | 5 recorded Spanish calls reviewed by Baja speakers | 4/5 "sounds local"; zero Spain vocabulary |
| Hours | Call at 16:59 | Agent answers |
| Hours | Call at 19:00 / Sunday night | Voicemail only — the agent never speaks |
| Hours | Text at 21:30 | Not sent; delivered 08:00 |
| Hours | STOP at 23:00 | Immediate confirmation, even outside the window |
| Accuracy | 30 blind price/stock questions | Matches website exactly |
| Numbers | "two boxes", "2.5 inch", "$179.50" | Read back correctly, no digit drift |
| Order | Full phone order to pickup | Draft invoice created, total correct |
| Order | Caller says "no" at confirmation | No invoice created |
| Interruption | Talk over the bot | Bot stops, listens, continues |
| Silence | 8 s of silence | Prompts once, then offers transfer |
| Failure | Kill `/api/products` | Bot says it can't check and offers a human — never invents |
| Transfer | Ask for Sam after 17:00 | Live call still lands on Sam's cell with context |
| SMS | Order placed | Summary SMS < 10 s, correct total |
| SMS | Reply STOP | Confirmed, then never contacted again |
| Missed call | Hang up after 1 ring | Text-back within 30 s (or 08:00 if late) |
| Email | Send at 02:00 asking price/stock | Correct reply in < 15 min, correctly threaded |
| Email | Complaint at 02:00 | No auto-send; draft + 07:00 digest to Sam |
| Email | Sender with an auto-responder | No loop; at most one auto-reply per 12 h |

---

## 13. Operations after launch

- **Daily (2 min):** skim the call list — intent, outcome, any "unknown" answers.
- **Weekly (15 min):** read 5 transcripts end-to-end (2 Spanish); add missing facts to the knowledge base, fix one prompt line.
- **Monthly:** check minutes vs plan, SMS delivery rates, and any carrier filtering notices.
- **Alerts to Sam:** every order, every quote request, every transfer, and any call where the bot said "I'm not sure" more than twice.

---

## 14. Decisions log and open questions

### 14.1 Answered (Nov 2026)

| # | Question | Sam's answer | Where it landed |
|---|---|---|---|
| 1 | Which number? | The existing **Google Voice** number | §2.1 — port it to Twilio; GV cannot forward to an automated system |
| 2 | When does it answer calls? | **Working hours only** | §4 — hours gate in front of the agent |
| 3 | When does it answer texts? | **Until 9 or 10 pm** | §6.3 — 21:00 hard stop recommended, 22:00 only for replies to a customer who texted first |
| 4 | Email? | **24/7** | §6.4 — new inbound pipeline, Resend |
| 5 | Which Spanish? | **Mexican, clear northern Baja**, Sam's tone and pace | §5.3 — vocabulary, address form, pace, QA gate |

### 14.2 Needed before Phase 0 (blocks signup or porting)

1. **Exact working hours**, per day — open/close, lunch, and do we answer Saturday
   and Sunday? (The site advertises weekend delivery, so this needs a real answer.)
2. **Is 919 789 1348 the Google Voice number?** And is the GV account personal (free)
   or Workspace? Personal = port via §2.1; Workspace = different product, different path.
3. **9 pm or 10 pm** for texts — pick one so the gate can be written once.
4. **Email address and domain** — do you already own a domain, and what address should
   customers write to (`orders@`, `sales@`, `info@`)?
5. **10DLC business identity** — legal business name, EIN (or sole proprietor + SSN),
   and the address to register.
6. **Budget ceiling for the first 3 months** — decides Starter vs Creator vs Pro.

### 14.3 Needed before launch (can be built around)

7. **Can the bot take orders on the phone**, or only quote and capture a lead?
8. **Pickup vs delivery** — which is offered, delivery zones, fees, minimums, lead times.
9. **Human backup** — who gets transfers and after-hours escalations, at what number?
10. **Call recordings** — store them, and for how long?
11. **Separate SMS sender** — recommend reusing the voice number; confirm.
12. **Spanish counter vocabulary** — confirm the words staff actually use (§5.3 table),
    and whether to address customers as **usted** or **tú** by default.
13. **What counts as urgent** enough to text Sam at night (an order over $X? a
    same-day pickup? a complaint?).

---

## 15. References

- ElevenLabs Agents pricing — https://elevenlabs.io/pricing/agents
- ElevenLabs voice cloning docs — https://elevenlabs.io/docs/voices/voice-cloning
- Twilio Voice pricing (US) — https://www.twilio.com/en-us/voice/pricing/us
- Twilio SMS pricing (US) — https://www.twilio.com/en-us/sms/pricing/us
- Twilio A2P 10DLC — https://www.twilio.com/en-us/phone-numbers/a2p-10dlc
- A2P 10DLC fees — https://help.twilio.com/articles/1260803965530
- Google Voice: forwarding to an automated system is unsupported — https://support.google.com/voice/answer/165221
- Google Voice: port your number out (unlock fee, PIN) — https://support.google.com/voice/answer/1065667
- Twilio: porting a Google Voice number — https://help.twilio.com/articles/223179728
- TCPA quiet hours (8 am–9 pm local) — https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts
- CAN-SPAM requirements — https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Resend inbound / receiving email — https://resend.com/docs

---

### Suggested repo layout (built during the phases)

```
api/
  voice/
    catalog.js        # speech-friendly product search
    lookup.js         # spoken item → priceId
    order.js          # phone-order wrapper around /api/order
    tools.js          # single dispatcher the agent calls
    postcall.js       # transcript → SMS + owner alert + storage
  twilio/
    voice.js          # TwiML: hours gate, warm transfer, voicemail
    sms.js            # inbound SMS, STOP/HELP, hours gate, queue
  email/
    inbound.js        # provider webhook → thread → reply
  cron/
    flush-sms.js      # 08:00 queue flush
lib/
  voice/
    prompts.js        # EN/ES system prompt + guardrails
    templates.js      # SMS + email wording
    catalog-speech.js # numbers/dates spelled for speech
    hours.js          # working-hours + SMS-window gates (single source of truth)
    spanish.js        # Baja vocabulary map, dollar read-backs
```

---

### Document history

- **v1** (`a02d996`) — initial plan: stack, call flow, clone recording script, SMS
  compliance, phases, cost model.
- **v2** — locked Sam's answers and added: the Google Voice constraint + the port-to-
  Twilio path (§2.1), the channel hours matrix and boundary rules (§4), Mexican
  northern-Baja Spanish rules and QA gate (§5.3), the 21:00 SMS window and 08:00
  queue (§6.3), the 24/7 email pipeline (§6.4), plus updated phases, tests, env
  vars, costs and the decisions log (§14).
