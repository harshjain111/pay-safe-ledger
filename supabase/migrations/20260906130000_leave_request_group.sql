-- ---------------------------------------------------------------------------
-- A leave request is one decision, not N.
--
-- CreateLeaveDialog expands a picked date range into one leave_records row per
-- day. That is right for the ledger — pay is computed per day — but nothing
-- recorded that those rows arrived together, so a five-day request landed in
-- the approval queue as five separate entries. The approver opened five
-- dialogs, chose the leave type five times, and could approve Monday and
-- reject Tuesday of a single request without noticing.
--
-- request_group_id ties them back together. Nullable on purpose: every row
-- written before this migration has none, and a row with no group is simply
-- its own group of one, which is what the client falls back to.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leave_records
  ADD COLUMN IF NOT EXISTS request_group_id uuid;

COMMENT ON COLUMN public.leave_records.request_group_id IS
  'Rows submitted together as one leave request. NULL = a standalone day (all rows predating this column).';

-- The approval queue groups by this, filtered to pending, so the index carries
-- the status alongside it.
CREATE INDEX IF NOT EXISTS leave_records_request_group_idx
  ON public.leave_records (request_group_id, status)
  WHERE request_group_id IS NOT NULL;
