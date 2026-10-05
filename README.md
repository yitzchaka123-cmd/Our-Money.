# Our Money

A cash ledger for a household that already uses [RiseUp](https://www.riseup.co.il/).

RiseUp sees every shekel that leaves your bank and your cards — except the ones you
withdraw and then spend. An ATM withdrawal shows up as a single ₪500 line and nothing
after it. This project fills that hole: you tell a Telegram bot what you spent, in
Hebrew or English, by typing or by voice, and it keeps the cash half of the ledger
next to the RiseUp half.

## How it works

```
Telegram (you + your wife)                RiseUp (read-only)
  text ─────────┐                              │
  voice ──► Whisper ──► transcript             │  GET /api/external/transactions
                 │                             ▼
                 └──► Claude intake ──►  Supabase  ◄── ATM withdrawals → wallet top-ups
                        (structured)          │
                                              ▼
                              balance · month report · unaccounted cash
```

**The number that matters** is *unaccounted cash*: everything withdrawn, minus everything
logged. `/balance` tells you what should be in the wallet right now. If it drifts, either
a spend went unlogged or your bank words withdrawals in a way the detector doesn't catch yet.

### A note on RiseUp's API

The [official RiseUp MCP server](https://github.com/riseup-oss/mcp) and the API behind it are
**strictly read-only** — the client has one verb, `GET`. There is no endpoint that writes a
transaction, so nothing here pushes cash back into RiseUp. This app is a companion ledger, not
an integration that modifies your RiseUp account.

## What the bot understands

Anything that sounds like a person reporting a purchase:

| You say | It logs |
|---|---|
| `80 שקל בסופר` | ₪80 · מזון וצריכה · היום |
| `שילמתי 45 על מונית אתמול` | ₪45 · תחבורה ורכב · אתמול |
| `120 במכולת ועוד 30 על קפה` | two entries |
| `fifty shekels on parking` | ₪50 · תחבורה ורכב · today |
| 🎤 a rambling voice note | transcribed, then the same |

Amounts in digits or words, relative dates (`אתמול`, `שלשום`, `ביום ראשון`), several expenses in
one breath, and Hebrew/English mixed mid-sentence. If it can't find an amount it asks rather
than guessing. If you say you paid by card, it declines — that's already tracked in RiseUp.

### Commands

| Command | Does |
|---|---|
| `/balance` | Cash withdrawn vs. cash logged, and what should be in the wallet |
| `/today` | Today's cash spending |
| `/month [YYYY-MM]` | Monthly totals by category and by person |
| `/undo` | Deletes your most recent entry |
| `/dashboard` | Sends you a personal link to the web dashboard |
| `/sync` | Pulls RiseUp now instead of waiting for the cron |
| `/categories` | The current category list |
| `/id` | Chat and user ids — how you get the group chat id for setup |
| `/help` | The above |

Every saved entry comes back with **✏️ שינוי קטגוריה** and **🗑 מחיקה** buttons, so a
mis-categorised expense is one tap to fix.

## The dashboard

`/dashboard` in the bot sends a personal link. What opens is RiseUp's own
interface, rebuilt: the same app bar and month navigation, the same hero
cashflow card, the same envelope cards in the same colours — income green,
variable yellow, fixed pink, tracking periwinkle, savings orange — with the same
planned-vs-actual bars that fill from the right, the same weekly and monthly
breakdowns that expand into real charges, and the same bottom sheets.

It is built on RiseUp's **envelopes**, not on the raw transaction feed. That is
what makes it the same interface rather than a lookalike: `GET
/api/external/budget/:month` returns the month as envelopes with planned amounts
and their actual transactions, which is exactly the shape the RiseUp dashboard
itself renders.

`docs/riseup-ui-spec.md` records the measured spec — colours, type sizes, card
anatomy, the money format. `docs/ui-comparison.md` is the loop to run whenever
new RiseUp screenshots arrive.

### Where cash appears

Cash is not a separate section. **A cash spend is filed into the RiseUp envelope
it belongs to** — the tracking category with that name, or the fixed envelope if
RiseUp already uses that label there, or the variable envelope otherwise (which is
exactly what RiseUp does with an uncategorised charge). It shows in the same card,
counts in the same total, and sits in the same breakdown row as a card spend would,
with a small ₪ (or microphone, for a voice note) marking it as cash.

- **`הכנסות במזומן`** — a green income envelope beside RiseUp's own, for cash
  received: a cash salary, a gift, a refund.
- **`ארנק מזומן`** — the cash bank, right under the hero: what should physically be
  in cash (withdrawals + cash income − cash spends, all-time), per wallet when
  there is more than one, this month's flows, and the month's movements when
  expanded.
- **Several wallets** — the one in a pocket, the other pocket, the drawer. A wallet
  is *where* cash is; the envelopes stay *what it was for*, so every wallet's
  spending rolls into the same RiseUp envelopes and every wallet's income into the
  same cash income envelope. ATM withdrawals land in the default wallet. Transfers
  between wallets move cash without touching any envelope. The ⋮ on the wallet
  card manages wallets and transfers; the bot understands "מהארנק של שרה".
- **The same controls RiseUp gives a charge, on a cash row** — tap one and the
  sheet offers exactly RiseUp's actions, live: `להוסיף הערה`, `להזיז את ההוצאה`
  (the "איזו הוצאה זו?" picker), `לפצל את ההוצאה` (parts must sum to the original,
  so a split can never create or lose money), `להזיז את העסקה לחודש אחר`,
  `זו הפקדה לחיסכון!` — plus edit and delete, which are ours to offer because the
  rows are ours. RiseUp's own charges open the same sheet with the same actions
  shown but disabled: the API is read-only.
- **Withdrawals** — detected from RiseUp automatically, or recorded by hand
  ("משכתי 500" to the bot, or `רישום משיכה מהכספומט` on the wallet card). A
  hand-entered withdrawal is linked to the bank line when RiseUp reports it — same
  amount, within three days — so the cash is never counted twice. Tap a
  withdrawal to move it to another wallet or say it was not one; a bank
  withdrawal keeps the bank's amount and date.
- **Expected cash** — the cleaner paid in cash every month, a cash salary, a
  one-off gift. A plan counts in the forecast before it happens and shows under
  its envelope as `צפוי לצאת במזומן` with a one-tap `שולם` (or `התקבל`), which
  records the real entry. Skip a month, stop it from a month on, or change it.
  The evening nudge offers the same buttons in Telegram when a plan's day comes.
- **The forecast with cash in it** — envelopes with no cash keep RiseUp's own
  figure. Budget envelopes (variable, trackers, savings) absorb cash spent inside
  the budget and only grow once it is overspent; planned cash is added on top.
  The fixed envelope adds every cash payment, since RiseUp's plan lists specific
  bank charges. Cash income expects what came in plus what is still due.
- **The card's ⋮** — add cash or expected cash here, `חודשים קודמים` (the last
  six months of this envelope, built the same way), move several cash spends to
  another envelope together, and the list of every plan.
- **Search and filter** — the app bar's icons. One search across RiseUp charges
  and cash, by merchant, category or exact amount, filtered by source, time range
  and wallet. Cash results open for editing.
- **Export** — the drawer exports the month or the last year as a CSV that opens
  correctly in Hebrew in Excel, each row in the envelope the dashboard shows.
- **Adding in the app** — the two dashed rows under the wallet, or the "add here"
  row at the bottom of any expanded envelope.
- **Refresh** — `עדכון מרייזאפ` in the drawer and beside the "last synced" line
  pulls from RiseUp now; opening the dashboard also refreshes if the mirror is
  older than ten minutes.

The workflow this is built for: do the card and bank side in RiseUp, then open this
and do the cash. **Opening the dashboard refreshes from RiseUp first** if the
mirror is more than ten minutes old, so the page is current when it loads. We can
only be as fresh as RiseUp's own pull from your bank; the "last synced" line at the
bottom says how old the data is.

The one deliberate difference from RiseUp: **an ATM withdrawal is not counted as
spending.** RiseUp has to count it, having no visibility past the cash machine.
Here it drops out of the envelopes — the wallet accounts for that money and the
cash entries say what it bought — so nothing is counted twice.

### The other screens

- **`מצב העו״ש`** (`/accounts`) — the cash wallet in RiseUp's account-card
  style. Bank and credit balances are not there yet: the read-only API exposes
  cashflow and transactions, and `get_balances` is still on RiseUp's roadmap.
- **המזומן היומי** (`/daily`) — the entries the AI intake was unsure about,
  gathered for one pass: confirm, fix or delete each, or confirm them all. This
  is what the floating green badge counts.

### Access

There are no passwords. `/dashboard` sends a private message with a signed,
member-bound link valid for seven days, and a six-digit code valid for ten
minutes; asked in the group, the bot answers privately. Opening the link sets an
httpOnly cookie good for thirty days.

**On a phone's home screen.** Add the dashboard to the home screen (Share → Add
to Home Screen on iPhone, the install prompt on Android) and it opens full-screen
like an app. A home-screen app keeps its own cookies, so the browser link does not
sign it in: type the code from the same bot message instead. Codes are stored
hashed, work once, and wrong guesses are capped household-wide.

### Working on the design

```bash
npm run ui:shots -- /tmp/shots     # renders + screenshots at a true 432px width
npm run dashboard:preview -- /tmp/dash.html expanded
```

Both render the real `DashboardView` against fixtures — no database, session or
deploy. A separate mock-up would drift within a week.

## Setup

### 1. Create the Telegram bot

Message [@BotFather](https://t.me/BotFather) → `/newbot` → keep the token.

Then get the numeric user ids for both of you from [@userinfobot](https://t.me/userinfobot).
These go in `TELEGRAM_ALLOWED_USER_IDS`; nobody else can use the bot, even if they find it.

### 2. The database: schema `money` in the shared Supabase project

Our Money does not get a Supabase project of its own. It lives in the household's
one shared project (`abirjil`, Frankfurt, free plan) next to the other apps, in
its own schema, **`money`**, and never touches anything outside it: no other
schema, no extension, no Supabase Auth, no storage, no global defaults.

```bash
SUPABASE_ACCESS_TOKEN=... npm run db:migrate -- --check   # what is pending
SUPABASE_ACCESS_TOKEN=... npm run db:migrate              # apply it
```

The runner checks every file with `scripts/lib/migration-guard.ts` first and
refuses anything that reaches outside `money`. It records what it applied in
`money.schema_migrations` rather than in Supabase's own migration history, which
the other apps own. Every object in the SQL is written as `money.<name>`.

- **Exposed to the API by appending.** The project's API schema list gets
  `, money` added to the end; the other apps' schemas stay listed. The app's
  client is created with `{ db: { schema: 'money' } }`.
- **Server-only.** Row level security on every table with no policies, and
  `anon`, `authenticated` and `PUBLIC` have no access to the schema at all;
  only the service role does. `tests/integration` checks this, and checks that
  the neighbours' grants are untouched.
- **Lean.** The free plan's 500 MB is shared by every app in the project. RiseUp
  data is kept as the columns the app reads, not raw JSON copies, and the daily
  sync prunes the sync log, spent sign-in codes and the old transaction mirror
  (`lib/riseup/prune.ts`). Cash entries, plans and envelopes are never pruned.
- **The service role key opens every app in the project.** It lives only in
  Vercel, marked sensitive, read only by server code.

### 3. Get a RiseUp token

[input.riseup.co.il/developer/tokens](https://input.riseup.co.il/developer/tokens) → create a
token with the **`budget:read`** scope. It's shown once.

> **These tokens expire after 30 days.** When a sync fails with a 401 the bot posts a message in
> your group chat telling you to mint a new one. Without that warning, the wallet would quietly
> stop being topped up and every balance after it would be wrong.

### 4. Configure and deploy

```bash
cp .env.example .env.local   # fill it in
npm install
npm test
npm run build
```

Deploy to Vercel (import the repository; `vercel.json` pins the functions to
Frankfurt, next to the database), set the variables in the project settings,
redeploy, then open **`/setup`** on the deployment. It shows which variables are
present (never their values), whether the database answers with every table in
place, whether the bot token works, and the last RiseUp sync — and it registers
the Telegram webhook as it goes. The daily sync re-registers it if the URL or
secret ever drifts, so `npm run telegram:register` is only for running elsewhere.

`vercel.json` schedules the RiseUp sync twice a day (05:00 and 17:00 UTC) and the
evening nudge at 17:30 UTC, each once a day, which every Vercel plan allows.

### 5. Check the withdrawal detector against your bank

This is the one step worth not skipping:

```bash
RISEUP_PAT=riseup_pat_... npx tsx scripts/probe-riseup.ts 2026-09
```

It prints what the detector caught **and** every other bank-account expense, so you can spot a
withdrawal it missed. Israeli banks each word it differently; add yours to `WITHDRAWAL_PATTERNS`
in `lib/riseup/withdrawals.ts` if needed. A missed pattern shows up later as a `/balance` that
says you overspent the wallet.

### 6. Optional: the shared group

Add the bot to a family group, run `/id` there, and put the (negative) chat id in
`TELEGRAM_GROUP_CHAT_ID`. New withdrawals and sync failures get announced there.

In a group the bot only reacts when spoken to — mention it, reply to it, or use a command —
so the two of you can talk normally without every message becoming an expense. Day-to-day
logging is meant to happen in your private chats with it.

## Configuration

See `.env.example` for the annotated list. The ones with real decisions behind them:

| Variable | Notes |
|---|---|
| `INTAKE_EFFORT` | `low` by default. Short expense messages don't need more; raise to `medium` if long voice notes mis-parse. |
| `STT_LANGUAGE` | Blank = auto-detect, which is right when you mix Hebrew and English. Set `he` for maximum Hebrew accuracy at the cost of English. |
| `TELEGRAM_ALLOWED_USER_IDS` | The allowlist. An empty value means nobody can log anything. |
| `APP_BASE_URL` | Must match the deployment exactly — it's what the dashboard links are built from. |
| `EVENING_NUDGE` | `on` by default. The 20:30 message names whoever has not logged cash today and offers paid / not this month for due plans; it stays silent on days with nothing to do. `off` silences it. |

## Why these services

- **Claude** (`claude-opus-5`) does all the language understanding, via structured outputs — the
  model returns a typed object, not prose we then have to parse. Dates are re-validated in code
  afterwards, because a hallucinated future date would quietly skew every month report.
- **OpenAI** appears exactly once, in `lib/stt/openai.ts`, to transcribe voice notes. Claude's
  Messages API doesn't accept audio. Swapping providers means replacing that one file.
- **Supabase** holds the ledger, in schema `money` of the shared project. **Vercel** runs
  the webhook and the cron, in Frankfurt next to the database.

## Development

```bash
npm test                  # unit tests, no network, database or API keys
npm run test:integration  # the real app code against Postgres + PostgREST
npm run typecheck
npm run dev
```

`npm run test:integration` starts a throwaway Postgres cluster, applies every
migration, puts PostgREST in front of it under `/rest/v1` (the shape supabase-js
expects) and runs server actions, the sync, the bot's handlers and the API routes
against it — only Telegram, Claude and RiseUp are stubbed. It needs Postgres server
binaries (found under `/usr/lib/postgresql`, or set `PG_BIN`) and downloads a
PostgREST binary on first run (or set `POSTGREST_BIN`).

The interesting logic is deliberately pure and directly testable: wallet arithmetic
(`lib/reconcile.ts`), withdrawal detection (`lib/riseup/withdrawals.ts`), callback encoding and
date formatting (`lib/telegram/format.ts`), and the date/amount guards around the AI parse
(`lib/intake/parse.ts`).

### Layout

```
app/api/telegram/webhook   Telegram entry point (secret-verified)
app/api/cron/sync-riseup   Scheduled RiseUp pull
app/api/cron/evening-nudge The evening reminder and due-plan buttons
app/api/export             CSV export
app/api/auth               Sign-in by link and by code
app/manifest.ts, public/   Home-screen app: manifest, icons, service worker
app/dashboard              The dashboard (page = auth + data, view = pure UI)
app/dashboard/components   RiseUp's UI, rebuilt: envelopes, sheets, drawer, amounts
app/accounts               מצב העו״ש
app/daily                  The daily cash review
lib/dashboard              Envelope + cash aggregation and breakdown buckets
lib/auth                   Signed sessions, one-time sign-in codes
lib/cash                   Dashboard actions, envelope filing, expected-cash plans
docs/riseup-ui-spec.md     Measured spec for the UI
docs/ui-comparison.md      How to check ours against new screenshots
lib/intake                 Claude structured extraction + category catalog
lib/stt                    Voice transcription (provider behind one function)
lib/riseup                 Read-only API client, withdrawal detection, sync
lib/telegram               API client, message formatting, update handlers
lib/reconcile.ts           Wallet arithmetic and report aggregation
supabase/migrations        The money schema (applied with npm run db:migrate)
scripts/migrate-shared.ts  Migration runner for the shared project, behind a guard
```

## Security notes

- The webhook rejects any request without the matching `X-Telegram-Bot-Api-Secret-Token`.
- Only allowlisted Telegram user ids can log or read anything.
- The Supabase service role key opens every app in the shared project. It is a sensitive
  Vercel variable, and it and every other secret stay server-side; there is no client
  bundle that touches them.
- The RiseUp token is read-only by design, so the worst case for a leaked PAT is disclosure,
  never modification of your RiseUp account. Rotate it at the tokens page regardless.
