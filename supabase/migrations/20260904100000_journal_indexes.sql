-- ============================================================================
-- Indexes for the ledger tables.
--
-- journal_lines carries only its primary key today — no index on any of the
-- three columns the Ledger page uses. That costs nothing right now (the table
-- is empty, and Postgres would ignore an index on a tiny table anyway), which
-- is exactly why it is worth doing now rather than later: the page reads every
-- journal line ever written, with no date filter and no limit, embedding both
-- journal_entry and account. Each settled payroll month adds a line per staff
-- per account, so the scan grows every month and never shrinks.
--
-- Deliberately NOT indexing the other ~50 unindexed foreign keys in the schema.
-- Almost all are created_by / updated_by / approved_by audit columns that no
-- query filters or joins on, and an index nothing reads is pure write cost.
-- These four are the ones the ledger query actually uses.
-- ============================================================================

-- .not('staff_id','is',null) and .eq('staff_id', …) — the page's main filter.
CREATE INDEX IF NOT EXISTS journal_lines_staff_idx
  ON public.journal_lines (staff_id)
  WHERE staff_id IS NOT NULL;

-- The journal_entry:journal_entry_id(…) embed.
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx
  ON public.journal_lines (journal_entry_id);

-- The account:account_id(…) embed.
CREATE INDEX IF NOT EXISTS journal_lines_account_idx
  ON public.journal_lines (account_id);

-- journal_entries is filtered by staff and read by date on the dashboard.
CREATE INDEX IF NOT EXISTS journal_entries_staff_idx
  ON public.journal_entries (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS journal_entries_created_idx
  ON public.journal_entries (created_at DESC);
