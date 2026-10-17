# Helper Q — progress

- C32 (entry waiting for approval counts nowhere until approved): done (638e894).
  Waiting cash spends are set aside per envelope (`awaiting`), so no sum sees them;
  wallet/bot sums use `countsAsSpent`; the transaction sheet got "לאשר".
- C34 (one income card): done. Render-only: `lib/dashboard/income-card.ts` +
  `IncomeCard.tsx`; the data keeps the fixedIncome envelope, so the forecast,
  its sheet, insights, brief, search and assistant count everything once.
- Checks: tsc, vitest (633), integration (147), next build — all pass.
  Lint not run (it can't run in this repo).
