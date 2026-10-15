# Helper brief — rules every helper follows

You are fixing items from one feedback video. Your items are listed in your task by number;
the full list with the user's exact words is in `docs/feedback/<date>-videoN.md`.

## Work
1. Work in your own git worktree and branch. Never push. Never edit anything under `docs/feedback/`.
2. Tests first: for each item write or extend a failing test (vitest, `tests/<name>.test.ts`; integration tests in `tests/integration/*.int.test.ts`), then make it pass.
3. **Commit after every item**, message in plain English starting with the item number,
   e.g. `V2-07: Show wallets as tiles`. No AI model names anywhere (no Co-Authored-By line).
   End every commit message with the line `Claude-Session: https://claude.ai/code/session_01RcpFF4zavZhPmB8DMxQjXt`.
4. Keep a short progress note in `.helper-progress.md` at the worktree root (item → done / blocked + why).
   Commit it with each item.
5. Stay inside your items. If you must touch a shared file (Shell.tsx, view.tsx, data.ts, globals.css),
   make the smallest change that works and add new code in new files where you can, so merges stay easy.
6. Match the code around you: TypeScript strict, Hebrew RTL UI, RiseUp look (see `docs/riseup-ui-spec.md`),
   existing amount formatting and colours. Plain, gentle Hebrew copy.

## Checks — one at a time, under a lock, each on its own port
Heavy checks share one machine. Wrap each in the lock:

    flock /tmp/our-money-checks.lock npx tsc --noEmit -p .
    flock /tmp/our-money-checks.lock npx vitest run
    flock /tmp/our-money-checks.lock npm run test:integration      # only if you touched lib/ or migrations

Screenshots: `scripts/preview-dashboard.tsx` renders the dashboard to static HTML from a fixture, and
`scripts/ui-shots.sh <outdir>` shoots it in Chromium inside a fixed-width iframe (headless Chrome's window
size does not set the layout viewport). Extend the fixture / add a preview mode for what you build, shoot
at phone widths 390 and 360, OPEN the images and look at them. If you need a live server, use your own
port (the lead gives it in your task). Save shots to `.shots/` in your worktree (not committed).

## Database
- Our tables live in schema `money` of a SHARED free Supabase project. Never touch another schema.
- A change needs a new migration file with the number the lead gave you in your task (never reuse a number). It must pass
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

## Also
- Run `npx next lint` (or `npm run lint` if it works) and `npx next build` once, under the lock, before your last commit.
- The AI model id comes from the `AI_MODEL` setting (`env.aiModel`); never write a model name in code.
