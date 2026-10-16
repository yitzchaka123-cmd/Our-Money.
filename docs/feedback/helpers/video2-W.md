# Helper W — progress

| Item | Status |
|---|---|
| V2-04 wallet card buttons (green + / red − / purple +, no duplicate income button) | done |
| V2-06a ask which wallet an ATM withdrawal went into | done — bot hook: `assignWithdrawal(topupId, walletId)` in lib/cash/withdrawal-wallet.ts (no session; for helper T), web action `assignWithdrawalToWallet` in lib/cash/wallet-actions.ts |
| V2-07 wallets as tiles | done (tiles when there is more than one wallet, as the list was) |
| V2-12 expected cash in this month | done — average of the last 3 months' withdrawals + cash income (only months since cash was first recorded); override per month in `money.cash_inflow_overrides` (migration 0009, not applied) |
| V2-13 wallet card ⋮ menu | done — חודשים קודמים (5 months in/out bars), עדכון כמה צפוי להיכנס, הוספת כסף לארנק, העברה בין ארנקים (2+ wallets), ניהול ארנקים |
| V4-07 wallet rows open the transaction sheet | done — spend/income open their envelope row's TransactionSheet; withdrawals and money added open WalletMovementSheet (same look: note, which wallet, month, edit, delete/undo); transfers keep their transfer sheet |
| V4-08 cash income kind and category | done — `cash_topups.income_kind` (migration 0009); fixed → monthly income plan (expected next month until it arrives); non_cashflow out of the cash-income card and forecast; categories משכורת/דיור/קצבאות + own names read back from past rows; asked in the cash entry sheet, the add-money panel, and the transaction sheet's "איזו הכנסה זו?" |
| Final checks | tsc, vitest, integration, next build — see report; lint not runnable in this repo |
