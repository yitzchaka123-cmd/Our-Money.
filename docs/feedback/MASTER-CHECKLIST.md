# Master checklist

Every single thing asked for, from the videos and from chat messages, one line each.
Status: **done** (with proof), **partly**, **not done**, **later** (only when you said later), **waiting** (needs your answer).
Re-read before every reply. Nothing is marked done without something to point to.

## From chat messages

| # | Request | Status | Proof / note |
|---|---|---|---|
| C1 | Telegram bot that takes text and voice notes and files cash spends with AI, for you and your wife | done | `lib/telegram/*`, `lib/intake/parse.ts`, `app/api/telegram/webhook/route.ts` |
| C2 | Dashboard must look and work exactly like RiseUp | partly (ongoing) | `docs/riseup-ui-spec.md`; video 1 items; each new video adds items |
| C3 | When you send RiseUp screenshots, compare them with ours and fix the differences | done (standing rule) | applied in video 1 (RiseUp part 2:55–7:35) |
| C4 | Cash shown inside the RiseUp envelopes | done | `lib/cash/envelopes.ts`, `mergeCashIntoEnvelopes` in `lib/dashboard/data.ts` |
| C5 | A cash income envelope | done | `cashIncome` type, `lib/riseup/envelopes.ts` |
| C6 | A cash "bank" (wallet) fed by ATM withdrawals | done | `lib/riseup/withdrawals.ts`, `cash_topups` |
| C7 | A manual refresh / sync button | done | `app/dashboard/components/SyncButton.tsx` (top bar), 1638555 |
| C8 | Several wallets | done | `cash_wallets`, `WalletsSheet.tsx`, `WalletSettingsSheet.tsx` |
| C9 | Same controls as RiseUp on every envelope and row | partly (ongoing) | menus from video 1 items 17–22 |
| C10 | Forget "learning RiseUp" for now | later | you said to leave it |
| C11 | Fix all bugs, add what is missing, do all of list #5 | done | earlier phases, commits up to 97189b9 |
| C12 | Put Our Money in the shared Supabase project, own schema `money`, free plan, never touch other schemas | done | migrations 0001–0007 in `money` only; guard `scripts/lib/migration-guard.ts` |
| C13 | Server-only access, legacy service-role key only on the server | done | 0002 lock; integration test "locks the money schema" |
| C14 | Deploy on Vercel, Frankfurt | done | project `our-money`, region fra1, https://our-money-brown.vercel.app |
| C15 | The front page should go straight to the dashboard | done | 97189b9 |
| C16 | Talk in plain, simple words; tell you where to click; never ask for keys in chat | done (standing rule) | — |
| C17 | Work from screen recordings in the Drive folder; ledger, progress file, helper rules | done | `docs/feedback/LEDGER.md`, `PROGRESS.md`, `helper-brief.md` |
| C18 | No AI model names in code or commits | done | model id read from `AI_MODEL` (`lib/env.ts`); commits since 08f4fa0 carry no model line |
| C19 | Transcribe every video three ways and merge; frames every second (half a second when busy); grey-dot zooms | done (videos 2–4) | see each video doc's "How it was read" section |
| C20 | Keep this master checklist | done | this file |
| C21 | Answer format A–F (transcript, end-result line, numbered problems, what bothers you, ideas, what I need) | done (standing rule) | — |
| C22 | Mark recordings of other projects "not this app" and don't build them | done (standing rule) | ledger status column |
| C23 | Set your RiseUp custom category names (סופר, מגנטים, הקשיבה, יציאות וכיף…, בזבוזים, תרומה, תיירות, טרריומים) | done | answered in video 2 at 3:06 ("I think you can find it") → V2-11 |

## From video 1 (2026-10-11) — details in [2026-10-11-video1.md](2026-10-11-video1.md)

| # | Request | Status | Proof |
|---|---|---|---|
| V1-1 | Claude assistant that looks like RiseUp's and answers from real data | done | `AssistantSheet.tsx`, `lib/assistant/*`, 409fb04 |
| V1-2 | Steps banner that really works or hides | done | `lib/dashboard/steps.ts`, `SetupSteps.tsx`, 63de69c |
| V1-3 | Daily brief swipe cards, accurate | done | `DailyBrief.tsx`, `lib/dashboard/brief.ts`, 1fc9f34 |
| V1-4 | Add money to a wallet; per-wallet settings; set the amount by hand | done | `WalletSettingsSheet.tsx`, `lib/cash/wallet-actions.ts`, 9f0f6cb |
| V1-5 | Wallet name and "ברירת מחדל" ran together | done | deadf1f |
| V1-6 | Add expense / income buttons — keep | done (no change) | — |
| V1-7 | Show the card, not letters like cc5910 | done | `lib/dashboard/accounts.ts`, aa26597, 89716fe |
| V1-8 | Don't use the Telegram name; my own name | done | `lib/profile/names.ts`, 4b85c44, cb7b3d7 |
| V1-9 | Sync button on top | done | 1638555 |
| V1-10 | Same order as RiseUp; not repetitive (one fixed card, summary once) | done | `lib/dashboard/merge-envelopes.ts`, b5a2b83 |
| V1-11 | Raw ids instead of category names | done (custom names → C23) | `lib/riseup/tracker-names.ts`, 50cd560 |
| V1-12 | Forecast not accurate | partly | targets read from `originalAmount` (751cdaf); all spending counted (1e01fa8); RiseUp sends no plan for everyday spending / income still to come |
| V1-13 | Full bar on empty envelopes | done | 8da4604 |
| V1-14 | Calendar weeks Sun–Sat | done | 79ca148 |
| V1-15 | Red link → blue | done | e2d0038 |
| V1-16 | Insight cards with X, undo, explanation, yes/no | done | `InsightCards.tsx`, e2b159f |
| V1-17 | Tracker ⋮ menu + history popup | done | `TrackerSheets.tsx`, 2ec95e2 |
| V1-18 | Add a category to track | done | fed74b0 |
| V1-19 | Income ⋮ menu, add money | done | 0466912 |
| V1-20 | Filter by account | done | 9b440d7, f4312d9 |
| V1-21 | Search anything, full page | done | 23f8cb3 |
| V1-22 | Split like RiseUp | done | a7fab28 |
| V1-23 | Accounts page "if you can" | done | 654a4d1 |
| V1-24 | Drop menu items we don't need | done | 6b6e22c |
| V1-25 | Settings, read-only | done | a975f1c |
| V1-26 | Loading placeholders | done | 2f7a82b |
| V1-27 | Extra problems found by the check (forecast, member on edit, drawer name, ⋮ on forecast, card ordinals, brief end card, "נשארו עוד", summary placement) | done | 1e01fa8 … eea7519 |

## From video 2 (2026-10-15) — details in [2026-10-15-video2.md](2026-10-15-video2.md)

| # | Request | Status | Proof |
|---|---|---|---|
| V2-1 | "כלכלה מעל היעד" card used one week's target | done | 2458907 |
| V2-3 | Sync button on every page; "לאומי קארד 1/2" on the accounts page | done | 7a05318, 1064038 |
| V2-4 | Wallet buttons: green + / red − / purple +, drop the duplicate | done | 25f3201 |
| V2-6 | ATM withdrawal asks which wallet; Telegram message per new withdrawal with wallet buttons | done | 0d1de40 (app), d6900d2 (Telegram) |
| V2-7 | Wallets as tiles | done | d6d5604 (tiles when 2+ wallets) |
| V2-9 | Daily brief cards like RiseUp's (or remove the feature) | done | ce9a827 (rebuilt + off switch; keep/remove is yours) |
| V2-10 | Supermarket spends go to your "סופר" tracker | done | c2eb7bd |
| V2-11 | Your RiseUp tracker names (from video 1) | done | money.tracker_overrides rows (2026-10-15) + loader |
| V2-12 | Predict cash coming into the wallets each month, editable | done | a00de27 |
| V2-13 | Wallet card ⋮ menu like the income menu | done | 03bac56 |
| V2-15 | Always-visible "last synced" line | done | b5e91b6 |
| V2-16 | Own notes on RiseUp charges; "היום/אתמול" on recent rows | done | 8ef5535 |
| V2-17 | A seen insight card doesn't come back | done | ca5789e |
| V2-18 | Forecast closer to RiseUp (past weeks of weekly budget) | partly | 2bb492e (≈351 ₪ fixed gap remains, shown in forecast sheet) |
| V2-19 | Fixed income (salary) counted as income | done | eda07a9 + check fix |

## From video 3 (2026-10-15) — details in [2026-10-15-video3.md](2026-10-15-video3.md)

| # | Request | Status | Proof |
|---|---|---|---|
| V3-1 | Better instructions for the group / `/id` | done | dbc9520 |
| V3-2 | Bot categories = your own envelopes; `/month` by them | done | c2eb7bd |
| V3-3 | Bot uses your chosen name, not the Telegram name | done | fe26fde |

## From video 4 (2026-10-15) — details in [2026-10-15-video4.md](2026-10-15-video4.md)

| # | Request | Status | Proof |
|---|---|---|---|
| V4-1 | Side menu from the right | done | 7ddefc6 |
| V4-2 | Telegram settings: nightly reminder off / frequency | done | ac5f17d |
| V4-3 | One-tap family group with the bot | done | dbc9520 |
| V4-4 | Setting: save right away or approve first; picker with only your envelopes; back button | done | cbb1f8e |
| V4-7 | Wallet rows open the transaction sheet | done | c059d12 |
| V4-8 | Cash income: kind (variable/fixed/not cashflow) and category incl. your own | done | 2a294b1 |
| V4-10 | Many more tip cards (~100) | done | 52ef0ac |
| V4-11 | Stay signed in longer | done | 91fe216 |
