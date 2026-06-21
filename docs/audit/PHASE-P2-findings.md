# Phase P2 — Batch payroll & payouts — Findings

Scope: `Payouts.tsx` + the payout journal builders, `PayrollGroups.tsx` (batch
settle), `Arrears.tsx`, `SalariesAdvances.tsx`, and the batch path in
`settlement-engine.ts`. Audited via 3 parallel reviewers, then each headline
finding was adversarially re-verified against source/migrations (severities
below are post-verification, not the raw reviewer claims). Static audit — no code
changed. Baseline: tsc clean · 124 tests · build OK.

Counts (verified): **1 Critical · 5 High · 7 Medium · 6 Low/Nit.**

**Verified-good (no leak):** SalariesAdvances salary confidentiality PASSES —
non-owners are never shipped `monthly_salary` (`staffSelect(isOwner)`), salary
figures are masked behind `canViewSalaries`, and `salary_settlements` RLS is
owner/own-staff only. The down-calibrations: `Amount` renders `null`→`₹0.00` (not
NaN; only `undefined`→NaN), and the PayrollGroups owner-mismatch is *latent*
(only owners hold `settlements.run` by default), so neither is the Critical the
reviewers first proposed.

---

## CRITICAL

**C1 — Payout double-posts the cash-out journal on retry/partial failure
(same class as the just-fixed settlement C1).** `Payouts.tsx` `handleExecutePayout`
(~190-326): it posts the immutable payout journal FIRST (Dr Staff Payable / Cr
Cash-Bank) and only then flips `paid_at`/`status`, with **no atomic guard that the
item is still unpaid** — the `payment_requests`/`expenses` update is a bare
`.eq('id', …)` with no `paid_at IS NULL` condition. A retry, a failure between the
journal post and the status flip, or a replayed update re-posts the journal →
**double cash-out in the ledger** (real money double-counted). The dialog's
Confirm is `isProcessing`-guarded which narrows the double-click window, but does
not close the retry/partial-failure path.
*Fix (proven pattern):* claim the row first with a conditional update —
`update({paid_at,…}).eq('id',id).is('paid_at', null).select()` (and status guard
for expenses) — abort if zero rows came back, and only THEN post the journal,
writing the journal id back. Mirrors the settlement reserve-first fix.

## HIGH

**H1 — No server guard against re-pay; salary-payout owner-only is client-only.**
The payout UPDATE policies on `payment_requests`/`expenses` don't re-assert
`paid_at IS NULL` (or owner for `payout_type='salary'`); the maker-checker trigger
only governs the *approve* transition, not *pay*. So the client is the only thing
preventing a re-pay or a non-owner salary payout. *Fix:* `WITH CHECK`/BEFORE-UPDATE
trigger guards on the pay transition (+ owner check for salary). (Same cluster as
P0-M1 "server-partial".)

**H2 — `Amount` component doesn't sanitize its input (cross-cutting).**
`ui/amount.tsx:21` `Math.abs(value)` with no `toAmount` — `undefined`→`₹NaN`,
`null`→`₹0.00` silently, and no rounding (float dust shows). Used on *every* money
display in the app. *Fix:* `const v = toAmount(value)` inside `Amount` — one change
hardens all money rendering. (High-leverage + safe; good first fix.)

**H3 — Petty-cash payout balance is a client read-modify-write.** `Payouts.tsx`
(~280-294): `newBalance = pettyCashBalance - amount` from stale in-memory state,
inserted with `balance_after` BEFORE the status flip and with no lock. Two
concurrent petty-cash payouts corrupt the running balance; a later failure leaves
a petty-cash debit with the request still unpaid. *Fix:* compute `balance_after`
server-side (RPC/trigger), sequence after the status update.

**H4 — Salary payout reconciles the settlement only `if (settlementId)` and
doesn't check that update.** `Payouts.tsx` (~234-244): a salary payout always posts
the journal + marks the request paid, but only writes
`paid_at`/`payout_journal_entry_id` back onto `salary_settlements` when a
settlementId is present, error unchecked → settlement and payout silently diverge.
*Fix:* require settlementId for salary payout; check the update rowcount/error.

**H5 — Batch settle gated on `can('settlements.run')` but the write path is
owner-only at the DB (latent).** `PayrollGroups.tsx` batch + `salary_settlements`
RLS (owner/own-staff) and the read RPCs. A non-owner *granted* `settlements.run`
gets a fully-enabled Batch Settle tab where every member fails. Only owners hold
`settlements.run` by default, so latent — but it's the P0-M1 client/server split
again. *Fix:* gate the tab on owner, or extend the RLS/RPCs to `settlements.run`.

## MEDIUM

**M1 — Zero-sum arrears get stuck `pending` forever.** Both `settlement-engine.ts`
`persistGroupSettlement` (~448) and `Settlements.tsx` `handleSettle` mark pending
arrears settled only inside `if (Math.abs(calc.arrears) >= 0.01)`. If a month's
pending arrears net to exactly 0 (e.g. +500 and −500), the block is skipped and
those rows stay `pending` against an already-settled month — unreachable forever.
*Fix:* mark pending arrears for the month settled whenever the month is settled,
regardless of net; only POST the arrears journal when `|net| >= 0.01`.

**M2 — `createExpensePayoutEntry` / `createAdvancePaidEntry` lack an `amount > 0`
guard** (`createSalaryPayoutEntry` has one) — a zero/negative amount posts a
degenerate "balanced" journal and still flips the row to paid/reimbursed. Add the
guard.

**M3 — The 3 inline payout/advance journal builders insert the header before
resolving account ids** — the orphan-header pattern I fixed in `createJournalEntry`
isn't applied to `createSalaryPayoutEntry`/`createExpensePayoutEntry`/
`createAdvancePaidEntry`. Resolve account ids first (or route them through
`createJournalEntry`).

**M4 — Batch settle confirm isn't disabled while running.** `PayrollGroups.tsx`
`runBatch`: the AlertDialog action can be reopened/clicked again, launching a
second concurrent loop (the per-member `isMonthSettled` recheck + unique constraint
mostly turn it into duplicate-errors rather than preventing it). Also missing a
null-check on the per-member `staff.select().single()` and any live progress.
*Fix:* `if (running) return` guard + disable the action + null-check + progress.

**M5 — `settlement-engine.ts` journal-id write-back is fire-and-forget** (residual
of the C1 fix): `update({ journal_entry_id }).eq('id', …)` with no error check — if
it fails the settlement keeps `journal_entry_id = null` while the journal exists.
Check the error.

**M6 — Payouts: float + critical-path issues.** Petty-cash amount/balance compared
without `toAmount` (sub-paise gate errors); the staff `create_notification` is
awaited inside the success try, so a notification failure AFTER the journal+status
shows an error toast for a completed payout (inviting a double-pay retry). Route
through `toAmount`; move notifications out of the critical path.

**M7 — SalariesAdvances resilience.** Fetch `catch` only `console.error`s (failure
looks like an empty roster); "Download All Payslips" has no in-flight disable; the
per-staff N+1 fan-out swallows inner errors (a failed advance RPC silently
understates outstanding). Add an error state, disable while downloading, check
inner errors.

## LOW / NIT

**L1 — Arrears `cancel` updates by `id` only** (`Arrears.tsx:175`) — no
`.eq('status','pending')`, so a stale list could cancel an already-`settled` arrear
without reversing its ledger entry. Add the status guard.
**L2** — Row actions across Payouts/Arrears/PayrollGroups lack in-flight disables
(double-click) — cosmetic given DB idempotency, but inconsistent with the app's
guard convention.
**L3** — `PayrollGroups.tsx` imports `StatutorySettings` unused (dead import).
**L4** — Payouts recovers the settlement month by regex-parsing the human
description (`/Salary for (.+)/`) with a silent current-month fallback — carry the
month as structured data.
**L5** — `petty_cash_transactions` accessed via `(supabase.from as any)` — add to
generated types.
**L6** — SalariesAdvances `salaryPayoutStatus` conflates "settled, no request" with
"request pending" (same `pending_payout`), and the "Payout"/`settled` filter label
doesn't match its predicate.

---

## Recommended fix order (when approved)
C1 (payout claim-first — proven pattern, money-out) → H2 (`Amount` toAmount — one
line, app-wide) → M1 (zero-sum arrears) → M2/M3 (payout journal guards) →
H4/H3/M5 → H1/H5 (server-side permission/guards — the P0-M1 cluster, do together)
→ the rest. Several of these (H1, H5) are the same "finish the server-side
permission + write-guards" theme as P0-M1/M2.

## Resolution (applied) — "fix all issues" pass (2026-06-22)
- **C1 FIXED** — `Payouts.tsx`: `handleExecutePayout` is now claim-first. The row
  is flipped to its paid state (expense `status='approved'→'reimbursed'`;
  advance/salary `paid_at IS NULL → now`) with a rowcount check **before** the
  cash-out journal is posted; the journal runs under a rollback guard that
  releases the claim on failure. A double-click or a second payer can no longer
  post the journal twice.
- **H2 FIXED** — `ui/amount.tsx`: `Amount` and `AmountInput` route through
  `toAmount` (shared with P3-H4).
- **H4 FIXED** — `Payouts.tsx`: a salary payout with no `settlement_id` is refused
  rather than clearing the payable while leaving the settlement unpaid +
  re-payable; settlement reconciliation runs only after the journal succeeds.
- **M1 FIXED** — `settlement-engine.ts` + `Settlements.tsx`: zero-sum arrears are
  marked `settled` unconditionally (journal posted only on a non-zero net), so
  they no longer stick in `pending`.
- **M2 FIXED** — `journal-entries.ts`: `createExpensePayoutEntry` /
  `createAdvancePaidEntry` now guard `amount > 0`.
- **M3 FIXED** — `journal-entries.ts`: the 3 inline payout/advance builders
  resolve all account ids **before** inserting the header (no orphaned header on
  a bad account code).
- **DEFERRED:** **H1/H5** server-side re-pay guard + batch-settle write-path RLS
  (NEEDS-LIVE); **H3** petty-cash atomicity (needs a DB function + live test);
  **M4–M7, L1–L6** lower-severity polish/resilience.

Verified: tsc clean · 161 tests · build OK.
