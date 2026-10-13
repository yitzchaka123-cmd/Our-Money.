# Progress checkpoint

Read this first after any stop.

## Video 1 — Screen_Recording_20261011_125951_Chrome.mp4 (Drive 1ox-tTv6u8F-W8bhSEAqXHiret_4FonE0)

- [x] Downloaded (455 s, 1080×2340)
- [x] Frames every 2 s (228), 145 scene-change frames, contact sheets; no black flashes found
- [x] Transcribed twice (faster-whisper large-v3-turbo, openai-whisper medium), both read in full
- [x] Watched every frame against the words; DB checked (tracker names and budgets, card hashes)
- [x] Item list written: docs/feedback/2026-10-11-video1.md
- [x] Helpers launched 2026-10-11 ~10:40 UTC (five, each in its own worktree)
- [x] Helpers merged, migrations 0003–0007 applied, pushed (6fa8147)
- [x] Full run on 6fa8147: typecheck clean, 400 unit, 84 integration, all previews render; no runtime errors in Vercel
- [x] Independent check of every item: 24 done, #12 partial (RiseUp sends no plan for variable / income), #6 no change; 9 extra problems found → helper F fixing them (no migration)
- [x] Helper F merged (48f31a7): 431 unit, 87 integration pass; deploy READY, no runtime errors; statuses updated, ledger done

Waiting for the user: whether to set their RiseUp custom category names for them (writing them directly was blocked).

## Helpers
| Helper | Items | Migration | State |
|---|---|---|---|
| A data and order | 10, 11, 12, 13, 14, 15 | 0003 | merged 4245a32, 0003 applied, pushed. #12 needs one sync to read envelope_shape (cron 17:00 UTC) |
| B top bar, assistant | 1, 2, 8, 9 | 0004 | merged 08f4fa0, 0004 applied, pushed; model id moved to AI_MODEL setting (Vercel) |
| C wallets, accounts, settings | 4, 5, 7, 23, 24, 25, 26 | 0005 | merged 48ecdfd, 0005 applied, pushed, deploy READY |
| D search, filter, menus | 17, 18, 19, 20, 21, 22 | 0006 | merged via integration helper (fb0bab7 → 6fa8147), 0006 applied, pushed, deploy READY |
| E daily brief, insights | 3, 16 | 0007 | merged c3c4744, 0007 applied, pushed, deploy READY |

Helper branches are `worktree-agent-*`; check `git log` on each for per-item commits after a stop.

## Stops
- 2026-10-11 ~15:00 UTC: the independent checker stopped on the usage limit (resets 15:00 UTC) before reporting.
  Checked after the stop (2026-10-13): all five helper branches and the integration merge are already in 6fa8147 and deployed;
  nothing uncommitted anywhere. Restarted only the checker (read-only, all 26 items).
- Item 12 follow-up: syncs since 0003 show trackers carry their target in `originalAmount` (balancedAmount is always 0) and
  variable / variableIncome envelopes send null for both. Targets now match RiseUp (רכב 2,850, פארמה 450, ביגוד 200, income 7,635).
