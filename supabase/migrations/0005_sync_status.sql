-- Why a sync failed, so the dashboard can say something useful: an expired
-- RiseUp token needs a person, a rate limit or network blip does not.
alter table sync_runs
  add column if not exists error_kind text
    check (error_kind in ('auth', 'rate_limit', 'network', 'other'));

create index if not exists sync_runs_succeeded_idx
  on sync_runs (finished_at desc) where status = 'succeeded';
