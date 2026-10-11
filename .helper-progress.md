# Helper A — progress (area A: data and order)

| Item | Status | Note |
|---|---|---|
| #14 calendar weeks | done | Sunday–Saturday weeks inside the month; 4–6 rows; out-of-month dates go to the edge week |
| #13 empty bar | done | `lib/dashboard/bar.ts`: empty when nothing planned or spent; full when spent with nothing planned (card and history sheet) |
| #15 blue link | done | `.btn-ghost.btn-link` uses the primary blue; red stays for destructive ghost buttons |
| #12 budgets + envelope_shape | done (partly — real goal field unknown) | plannedAmount takes the first NON-ZERO of balancedAmount, originalAmount and seven undocumented candidates; income expects max(plan, arrived); each sync writes field names + value kinds to `sync_runs.envelope_shape` (migration 0003, not applied). The tracker goals only appear once a sync shows which field holds them |
| #11 tracker names | done | `lib/riseup/tracker-names.ts`: own name field → most-used label on its own transactions → same key in other months → built-in table → note → "קטגוריה למעקב". Applied at sync (name book from stored + fresh months) and at load for rows stored with raw ids; history uses the same book. Custom trackers with no transactions ever stay "קטגוריה למעקב" until D adds rename |
| #10 one fixed card + order | done | `lib/dashboard/merge-envelopes.ts` folds all fixed envelopes into one (plan = sum of plans; uncharged planned charges listed greyed as "צפוי לרדת", named from earlier months) and weekly tracker parts into one card (weekly breakdown). Order variable → trackers → add-tracker slot (`onAddTracker?` on EnvelopeList, renders nothing until passed) → fixed → summary once → income → cash income → savings. Pickers dedupe via `envelopeChoices` (also fixes the daily page). Cash pinned to a folded-away id lands in the merged card |
