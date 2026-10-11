# Helper brief — rules every helper follows

You are fixing items from one feedback video. Your items are listed in your task by number;
the full list with the user's exact words is in `docs/feedback/<date>-videoN.md`.

## Work
1. Work in your own git worktree and branch. Never push. Never edit anything under `docs/feedback/`.
2. Tests first: for each item write or extend a failing test (vitest, `tests/unit/...`), then make it pass.
3. **Commit after every item**, message in plain English starting with the item number,
   e.g. `V1-09: Show fixed expenses as one card grouped by category`. No AI model names anywhere.
4. Keep a short progress note in `.helper-progress.md` at the worktree root (item → done / blocked + why).
   Commit it with each item.
5. Stay inside your items. If you must touch a shared file (Shell.tsx, view.tsx, data.ts, globals.css),
   make the smallest change that works and add new code in new files where you can, so merges stay easy.
6. Match the code around you: TypeScript strict, Hebrew RTL UI, RiseUp look (see `docs/riseup-ui-spec.md`),
   existing amount formatting and colours. Plain, gentle Hebrew copy.

## Checks — one at a time, under a lock, each on its own port
Heavy checks share one machine. Wrap each in the lock:

    flock /tmp/our-money-checks.lock npx tsc --noEmit -p .
    flock /tmp/our-money-checks.lock npx vitest run tests/unit
    flock /tmp/our-money-checks.lock npm run test:integration      # only if you touched lib/ or migrations

For screenshots start the dev server on your own port (helper A 3101, B 3102, C 3103, D 3104, E 3105):
`PORT=31xx npx next dev -p 31xx` and use `scripts/ui-shots.sh` (it renders inside a fixed-width iframe
because headless Chrome's window size does not set the layout viewport). Take shots at 390×844 and 360×800,
open them and look at them. Save to `.shots/` in your worktree (not committed) and mention them in your report.
The dashboard needs data: use the integration-test seed or the screenshot fixture the script already uses.

## Database
- Our tables live in schema `money` of a SHARED free Supabase project. Never touch another schema.
- A change needs a new file `supabase/migrations/00NN_<name>.sql` (next free number). It must pass
  `scripts/lib/migration-guard.ts` (only `money`, no extensions, no auth, no global defaults) and keep
  the server-only lock (new functions: `revoke execute ... from public`). Do NOT apply it — the lead applies it.
- Keep it lean: no raw JSON dumps, no large tables.

## Secrets
Never print, paste or commit a key, token or password. Never read Vercel env values.

## RiseUp
The RiseUp API is read-only. Anything that would "edit RiseUp" is stored on our side as our own override
and labelled honestly in the UI.

## Report
When done (or stopped), reply with: items done (with commit hashes), items blocked and why,
any migration file added, screenshots taken, and anything the lead must decide.
