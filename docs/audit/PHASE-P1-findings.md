# Phase P1 — Settlement engine + ledger (money core) — Findings

Scope reviewed: `lib/settlement-engine.ts` (full), `lib/journal-entries.ts`
(full — every entry type, balance traced), `pages/Settlements.tsx` (single-staff
math + settle ordering, spot-checked vs engine), `salary_settlements` constraints.
`attendance-pay.ts` (computeDayBreakdown) is deferred to **P4** (attendance
engine) to avoid duplication. A full line-by-line of all Settlements.tsx buttons
(manual overrides, deduction-adjustment, recalc, payslip) is a candidate **P1b**
sub-pass. Static audit — no code changed. Baseline: tsc clean · 122 tests · build.

Counts: **1 Critical · 3 High · 8 Medium · 3 Low/Nit.**

The double-entry itself is **correct**: I traced every line of
`createSalarySettlementEntry` — base salary, bonus, overtime, employee/employer
PF·ESI·PT, advance adjustment and loan EMI all post as balanced pairs; total
debits = credits; `validateBalance` enforces ≤ ₹0.01. The arrears and payout
entries also balance. The problems are in *ordering*, *eligibility*, and
*duplication* — not the bookkeeping.

---

## CRITICAL

**C1 — Settlement finalize is non-atomic; a partial failure leaves an orphan
*immutable* salary journal that corrupts the ledger.**
`settlement-engine.ts:380-468` (`persistGroupSettlement`) and the mirror in
`Settlements.tsx:679-790` both do: **(1) post the salary journal (immutable) →
(2) insert the `salary_settlements` row → (3) update journal ref → (4) arrears →
(5) payout request**, as separate awaits with no transaction. `salary_settlements`
has `UNIQUE (staff_id, settlement_month)` (migration `…191136:111`), so a
double-submit/retry/race makes step 2 throw — **but step 1's journal is already
posted and `is_immutable = true`** (`journal-entries.ts:492`). Result: a balanced
but orphan salary entry inflating Salary Expense + Staff Payable, with no
settlement behind it and no easy cleanup (immutable). The single-staff flow guards
with an `is_salary_settled` check first (`Settlements.tsx:656`) which narrows the
window; the batch `persistGroupSettlement` has **no self-check** and is the most
exposed (concurrency, or a retry after a network blip where the first write
actually landed).
*Fix:* make finalize atomic — a single Postgres function (settlement row + journal
in one transaction), or reserve the settlement row FIRST and post the journal only
after, deleting the row if the journal fails. Until then, batch must verify
`isMonthSettled` immediately before each `persistGroupSettlement`.

## HIGH

**H1 — ESI eligibility is tested against the *pro-rata* wage, not the full
monthly wage** — `settlement-engine.ts:202-203` and `Settlements.tsx:342-343`.
`esiBase = proRataSalary; esiEligible = … esiBase <= esi_eligibility_ceiling`. A
staff member whose *monthly* wage exceeds the ESI ceiling (so should be ineligible)
but who **joins/leaves mid-month** has a pro-rata wage below the ceiling →
wrongly becomes ESI-eligible and gets ESI deducted that month. Eligibility must be
decided on the contractual monthly wage; only the *deduction base* should pro-rate.
Present in **both** the engine and the single-staff screen.

**H2 — The settlement math is implemented twice and is already drifting.**
`computeSettlement` (engine) and `calculateSettlement` (`Settlements.tsx`) are
parallel copies of the same complex payroll math; the file header
(`settlement-engine.ts:10-13`) admits the single-staff screen "has NOT yet been
refactored onto it." They already differ in comments/structure (e.g. the
updated_at proration note exists only in the screen). Two copies of money logic =
guaranteed divergence over time; a fix applied to one (e.g. H1) can be missed in
the other. *Fix:* unify the single-staff screen onto `computeSettlement` (the
stated post-deploy plan) and keep one source of truth.

**H3 — Batch settlement never recovers outstanding advances.**
`settlement-engine.ts:146` `advanceToAdjust = opts.advanceToAdjust ?? 0`, and the
batch caller passes no override → `currentAdj = 0`, so a group settlement pays out
full net and carries the entire advance forward unrecovered (the single-staff
screen lets the user choose an amount). If batch is meant to auto-recover, this
silently skips it. *Fix:* default batch `advanceToAdjust` to `maxAdjustable` (or
make it an explicit batch option) and surface it in the UI.

## MEDIUM

**M1 — Inactive staff with no `date_of_leaving` prorate by `updated_at`.**
`settlement-engine.ts:168-175` / `Settlements.tsx:244-249` — a deliberate legacy
fallback, but `updated_at` mutates on *any* edit, so editing such a record (even a
typo fix) changes its proration, and re-settlement could differ. Prefer requiring
`date_of_leaving` for exit proration; treat inactive-without-leaving as a warning.

**M2 — PF base is the pro-rata *total* salary, not Basic.** `…engine:197` /
`Settlements:337` `pfBase = min(proRataSalary, pf_base_cap)`. Statutory EPF is on
Basic (+DA). Using total salary over/under-states PF unless `pf_base_cap` is always
the binding limit. Confirm the intended PF base policy.

**M3 — Employee ESI rate comes only from a per-staff column, no settings
fallback.** `…engine:204` / `Settlements:344` read `cs.esi_employee_rate`; if null
→ 0, so an eligible employee gets *employer* ESI computed (from settings) but **no
employee ESI** withheld. Add a statutory `esi_employee_rate` default.

**M4 — Unrounded intermediate amounts are stored.** `…engine:177-178,218` —
`proRataSalary`, `leaveDeduction`, `grossSalary` aren't `round2`'d; only
`netPayable` is rounded. `net_salary` (= grossSalary) is persisted with float dust
(`…engine:415`). Round the stored money fields.

**M5 — `createJournalEntry` can orphan a header if an account code is missing.**
`journal-entries.ts:232-262` — the header is inserted, then `getAccountId` runs per
line in `Promise.all`; if an account code doesn't exist it throws *before* the
lines insert, so the `linesError` rollback (`:270`) never runs and an empty journal
header is left behind. Insert the header only after resolving all account ids (or
clean up on any failure).

**M6 — Holiday tables fetched unfiltered, per staff.** `…engine:322-323` selects
ALL `holidays` + `holiday_assignments` with no date/scope filter, repeated for
every staff member in a batch. Add a date-range/outlet filter.

**M7 — `persistGroupSettlement` posts the immutable journal before knowing the
settlement will succeed** (same root as C1, called out separately for the fix):
order the writes so nothing immutable is posted until the settlement row exists.

**M8 — Rectification/Cancellation have no double-reversal guard.**
`journal-entries.ts:972,1040` — nothing prevents reversing the same entry twice
(over-correcting the ledger). Track/return whether a reversal already exists.
(Confirm consumers in P3/P8.)

## LOW / NIT

**L1 — `carryForwardAdvance` isn't rounded** (`…engine:223`) — float dust in the
stored closing advance balance.
**L2 — `getAccountId` runs one query per line per entry** — cache the code→id map.
**L3 — Immutability is a separate UPDATE after insert** (`…engine:445`) — a brief
window where the salary journal is mutable; negligible single-threaded.

---

## Reviewed, correct
Double-entry balance for salary settlement, arrears, payout, expense approval/
payout, advance paid (each a balanced pair; `validateBalance` ≤ ₹0.01). Payslip
NET uses `balance_payable` (authoritative) and the earnings−deductions table
reconciles to it including arrears (verified during the arrears work). Unique
`(staff_id, settlement_month)` constraint exists.

## Deferred
`attendance-pay.computeDayBreakdown` → **P4**. Full Settlements.tsx button/flow
inventory (manual incentive/bonus/OT overrides, deduction-adjustment maker-checker,
recalc, payslip download, the already-settled lock) → optional **P1b**.

## Recommended fix order (Wrap)
C1 (atomic finalize — Postgres function) → H1 (ESI eligibility, both copies) →
H2 (unify onto the engine, which also closes the "both copies" risk) → H3 →
M4/M2/M3 (statutory accuracy) → M5/M6 → the rest.
