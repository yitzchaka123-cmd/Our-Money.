# Helper S — progress

- C24 Weekly summary in Telegram — done. Cron `/api/cron/weekly-summary` (Sun 06:00 UTC), figures from `loadDashboard`,
  once per week (`app_settings.weekly_summary_week`), household switch "סיכום שבועי בטלגרם" (app_settings `weekly_summary`, default on).
  No migration needed.
- C26 "מה קניתם כאן?" — done. Asked after each sync (max 5), once per charge (migration 0013 `money.business_questions`,
  NOT applied), reply saved to `money.transaction_notes`, household switch "לשאול על עסק חדש" (app_settings `ask_new_business`, default on).
  Telegram allows one markup per message: the question uses force_reply, so "דלג" is a typed reply, not an inline button.
- Checks: tsc, vitest (634), integration (161), next build — all pass. Lint: not runnable (Next 16 has no `next lint`, no eslint).
