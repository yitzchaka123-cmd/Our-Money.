-- What each sync saw in RiseUp's budget payload: for every envelope type, the
-- field names and the kind of value each held ("string", "boolean",
-- "number:zero", "number:nonzero", ...). Never a value: no amounts, no ids,
-- no text. One small object per run, written by lib/riseup/shape.ts.
--
-- It exists to find the field that really carries a tracker's goal and the
-- expected income (feedback video 1, item 12): the documented
-- balancedAmount comes back zero for every tracker.

alter table money.sync_runs add column if not exists envelope_shape jsonb;

comment on column money.sync_runs.envelope_shape is
  'Field names and value kinds per RiseUp envelope type seen by this sync; never values.';
