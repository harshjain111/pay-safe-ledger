-- =============================================================================
-- HR Module — Phase B (item 8): West Bengal Professional Tax slabs
-- =============================================================================
-- The statutory settings stored a single flat PT amount. WB PT is slab-based on
-- monthly gross. Add a pt_slabs jsonb column pre-filled with the standard WB
-- monthly slabs. The legacy pt_monthly_amount / pt_min_gross columns are kept so
-- old data still works (computeProfessionalTax falls back to them only when no
-- slabs are present). Amounts should be confirmed with the company's CA.
--
-- WB monthly PT (by gross): <=10,000 Nil; 10,001-15,000 110; 15,001-25,000 130;
-- 25,001-40,000 150; >40,000 200. Encoded as ordered {upTo, amount} where upTo is
-- the inclusive upper bound and the final null upTo means "no upper limit".
-- =============================================================================

ALTER TABLE public.payroll_statutory_settings
  ADD COLUMN IF NOT EXISTS pt_slabs jsonb NOT NULL DEFAULT '[
    {"upTo": 10000, "amount": 0},
    {"upTo": 15000, "amount": 110},
    {"upTo": 25000, "amount": 130},
    {"upTo": 40000, "amount": 150},
    {"upTo": null,  "amount": 200}
  ]'::jsonb;
