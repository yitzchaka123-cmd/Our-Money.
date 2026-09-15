/**
 * Read one month of RiseUp transactions and report what the withdrawal
 * detector would catch — run this right after setting RISEUP_PAT so you can
 * confirm your bank's wording is covered before trusting the wallet balance.
 *
 *   RISEUP_PAT=riseup_pat_... npx tsx scripts/probe-riseup.ts 2026-09
 */

import { fetchTransactions, recentMonths } from '../lib/riseup/client';
import { isWithdrawal } from '../lib/riseup/withdrawals';

const month = process.argv[2] ?? recentMonths(1)[0]!;
const transactions = await fetchTransactions(month);

const withdrawals = transactions.filter(isWithdrawal);
const bankExpenses = transactions.filter(
  (t) => !t.isIncome && (t.sourceType ?? '').toLowerCase() === 'checkingaccount',
);

console.log(`Month ${month}: ${transactions.length} transactions`);
console.log(`\nDetected as cash withdrawals (${withdrawals.length}):`);
for (const t of withdrawals) {
  console.log(`  ₪${t.amount}  ${t.transactionDate.slice(0, 10)}  ${t.businessName}`);
}

console.log(`\nOther bank-account expenses — check for missed withdrawal wording:`);
for (const t of bankExpenses.filter((t) => !isWithdrawal(t))) {
  console.log(`  ₪${t.amount}  ${t.transactionDate.slice(0, 10)}  ${t.businessName}`);
}
