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
| `/sync` | Pulls RiseUp now instead of waiting for the cron |
| `/categories` | The current category list |
| `/id` | Chat and user ids — how you get the group chat id for setup |
| `/help` | The above |

Every saved entry comes back with **✏️ שינוי קטגוריה** and **🗑 מחיקה** buttons, so a
mis-categorised expense is one tap to fix.

## Setup

### 1. Create the Telegram bot

Message [@BotFather](https://t.me/BotFather) → `/newbot` → keep the token.

Then get the numeric user ids for both of you from [@userinfobot](https://t.me/userinfobot).
These go in `TELEGRAM_ALLOWED_USER_IDS`; nobody else can use the bot, even if they find it.

### 2. Create the Supabase project

Run `supabase/migrations/0001_init.sql` against a new project (SQL editor, or
`supabase db push`). It creates the tables, seeds the Hebrew category list, and enables RLS
with no permissive policies — every path in goes through a server route holding the service
role key, so nothing is reachable from a browser.

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

Deploy to Vercel, set the same variables in the project settings, then point Telegram at it:

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
PUBLIC_URL=https://your-app.vercel.app \
npm run telegram:register
```

`vercel.json` already schedules the RiseUp sync twice a day (05:00 and 17:00 UTC).

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

## Why these services

- **Claude** (`claude-opus-5`) does all the language understanding, via structured outputs — the
  model returns a typed object, not prose we then have to parse. Dates are re-validated in code
  afterwards, because a hallucinated future date would quietly skew every month report.
- **OpenAI** appears exactly once, in `lib/stt/openai.ts`, to transcribe voice notes. Claude's
  Messages API doesn't accept audio. Swapping providers means replacing that one file.
- **Supabase** holds the ledger. **Vercel** runs the webhook and the cron.

## Development

```bash
npm test          # 59 tests, no network or API keys needed
npm run typecheck
npm run dev
```

The interesting logic is deliberately pure and directly testable: wallet arithmetic
(`lib/reconcile.ts`), withdrawal detection (`lib/riseup/withdrawals.ts`), callback encoding and
date formatting (`lib/telegram/format.ts`), and the date/amount guards around the AI parse
(`lib/intake/parse.ts`).

### Layout

```
app/api/telegram/webhook   Telegram entry point (secret-verified)
app/api/cron/sync-riseup   Scheduled RiseUp pull
lib/intake                 Claude structured extraction + category catalog
lib/stt                    Voice transcription (provider behind one function)
lib/riseup                 Read-only API client, withdrawal detection, sync
lib/telegram               API client, message formatting, update handlers
lib/reconcile.ts           Wallet arithmetic and report aggregation
supabase/migrations        Schema
```

## Security notes

- The webhook rejects any request without the matching `X-Telegram-Bot-Api-Secret-Token`.
- Only allowlisted Telegram user ids can log or read anything.
- The Supabase service role key and every other secret stay server-side; there is no client
  bundle that touches them.
- The RiseUp token is read-only by design, so the worst case for a leaked PAT is disclosure,
  never modification of your RiseUp account. Rotate it at the tokens page regardless.
