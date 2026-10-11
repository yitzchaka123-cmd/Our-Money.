# Helper B progress (video 1)

| Item | Status | Notes |
|---|---|---|
| #8 greeting name | done | `household_members.preferred_name` (migration 0004); greeting uses it, else just "היי"; `setPreferredName` in `lib/profile/actions.ts` |
| #2 steps banner | done | `lib/dashboard/steps.ts` computes RiseUp synced / Telegram linked / name set / wallet amount set; banner hides when all done; `SetupSteps.tsx` checklist sheet with inline sync, name form, links |
| #9 sync button | done | `SyncButton` in the top bar (spins, then "סונכרן עכשיו" / the reason); shared `useRiseupSync` hook, RefreshButton reuses it |
| #1 assistant | done | `AssistantSheet.tsx` (RiseUp chat look: intro card, chips, history, new chat, "אני על זה...", disclaimer); server actions `lib/assistant/actions.ts`; context from `loadDashboard` (this + last month, every transaction, category totals, wallets) + `get_month` tool; chats in `assistant_chats`/`assistant_messages` (0004), 20 per member |

Migration: `supabase/migrations/0004_assistant_and_names.sql` (not applied).
Screenshots: `.shots/` (not committed); preview modes in `scripts/preview-overlays.tsx`.
