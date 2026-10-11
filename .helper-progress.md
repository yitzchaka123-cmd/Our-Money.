# Helper E — progress (video 1)

| Item | Status | Notes |
|---|---|---|
| #3 daily brief | done | Blob shows the true count (new RiseUp charges + new cash + cash to review), hidden at 0; swipe deck in `DailyBrief.tsx`; insights in `lib/dashboard/brief.ts`; read point in `money.member_brief_state` (migration 0007, not applied). `/daily` kept as the review list; `/dashboard?brief=1` opens the deck. |
| #16 insight cards | done | Carousel at the top as in RiseUp (`InsightCards.tsx`), rules in `lib/dashboard/insights.ts` (forecast moved since yesterday, big charge this week, tracker over target / running fast, income arrived, cash short of planned cash). X + undo snackbar, popup, yes/no; `money.insight_feedback` and `money.forecast_snapshots` (same migration). |

Screenshots: `scripts/brief-shots.sh .shots` (390 and 360).
