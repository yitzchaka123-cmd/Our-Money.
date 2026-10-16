# Helper B progress

- V2-9 brief cards like RiseUp + "הסיכום היומי" switch — done. Cards wear their envelope colour
  (tokens, deeper tint + full-colour band), category line, amount, business, date, who logged cash,
  account name (dashboard naming, numbered), and always one line under the card (insight, or where it
  went: "נכנס לתזרים של אוקטובר תחת סופר"). Settings switch hides blob, deck and drawer link
  (household_members.show_daily_brief, migration 0012 — not applied).
- V2-17 seen insight cards — done. A card shows only on the Israel day it first appears
  (insight_feedback.seen_at, stamped by the loader) and never after it was opened ("לפרטים נוספים",
  opened_at), answered or dismissed. Keys step with material change: tracker over target every
  quarter of the target (min 100 ₪), tracker pace per quarter of target spent, cash-low every 200 ₪.
  Columns in migration 0012 (not applied; until then cards behave as before and a log line notes it).
- V4-10 tips library — done. lib/dashboard/tips.ts: ~105 original Hebrew tips (title, one or two
  sentences, optional "מה עכשיו?"), about two thirds tied to the household's data (eating out /
  supermarket over or fast, many small card charges, negative or positive forecast, negative cash,
  salary just in, weekend-heavy, subscriptions, fees, installments, deliveries, coffee, fuel, big
  charge, month start/end). Two tips after the data cards (one when there are 3+), data-linked first;
  each shown once (same seen/opened rules as V2-17, key "tip:<id>"). Eight flat drawings in TipArt.tsx.
- Checks: tsc, vitest (48 files), integration (14 files), `next build` all pass. `next lint` does not
  exist in Next 16 and the repo has no eslint, so lint could not run. `next build` needs a real
  node_modules (Turbopack rejects the symlink); built with a temporary copy.
