-- ============================================================================
-- Remove the ability to bulk-clear transactional data.
--
-- The client does not want this option to exist. The Settings screen for it is
-- gone, along with its settings.data.manage right, but a UI that no longer
-- offers a button is not the same as a capability that no longer exists: the
-- function was SECURITY DEFINER and reachable by anyone who could call an RPC.
--
-- Dropping it removes the capability rather than hiding it. Nothing else calls
-- it — the only caller was the deleted card.
--
-- This destroys no data. It removes a function whose entire purpose was to
-- destroy data.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_clear_transaction_data(date, date, uuid);
