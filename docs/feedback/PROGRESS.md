# Progress checkpoint

Read this first after any stop.

## Video 1 — Screen_Recording_20261011_125951_Chrome.mp4 (Drive 1ox-tTv6u8F-W8bhSEAqXHiret_4FonE0)

- [x] Downloaded (455 s, 1080×2340)
- [x] Frames every 2 s (228), 145 scene-change frames, contact sheets; no black flashes found
- [x] Transcribed twice (faster-whisper large-v3-turbo, openai-whisper medium), both read in full
- [x] Watched every frame against the words; DB checked (tracker names and budgets, card hashes)
- [x] Item list written: docs/feedback/2026-10-11-video1.md
- [x] Helpers launched 2026-10-11 ~10:40 UTC (five, each in its own worktree)
- [ ] Helpers merged, migrations applied, pushed
- [ ] Full end-to-end run
- [ ] Independent check of every item
- [ ] Deploy live, statuses updated

## Helpers
| Helper | Items | Migration | State |
|---|---|---|---|
| A data and order | 10, 11, 12, 13, 14, 15 | 0003 | merged 4245a32, 0003 applied, pushed. #12 needs one sync to read envelope_shape (cron 17:00 UTC) |
| B top bar, assistant | 1, 2, 8, 9 | 0004 | merged 08f4fa0, 0004 applied, pushed; model id moved to AI_MODEL setting (Vercel) |
| C wallets, accounts, settings | 4, 5, 7, 23, 24, 25, 26 | 0005 | merged 48ecdfd, 0005 applied, pushed, deploy READY |
| D search, filter, menus | 17, 18, 19, 20, 21, 22 | 0006 | running |
| E daily brief, insights | 3, 16 | 0007 | running |

Helper branches are `worktree-agent-*`; check `git log` on each for per-item commits after a stop.

## Stops
(none yet)
