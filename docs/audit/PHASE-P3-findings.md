# Phase P3 — Advances, Expenses, Approvals — Findings

Scope: `Approvals.tsx` (+ `advance-approvals.ts`, `login-reset.ts`,
`components/approvals/*`, `components/expenses/*`), `Requests.tsx`,
`NewRequest.tsx`, `Expenses.tsx`, `NewExpense.tsx`. Audited via 3 parallel
reviewers, then the security/money headlines were re-verified against
source + migrations (severities below are post-verification). Static audit — no
code changed. Baseline: tsc clean · 161 tests · build OK.

Counts (verified, de-duped): **0 Critical · 5 High · 7 Medium · 7 Low/Nit.**

**Verified-good:** the **advance** maker-checker is the strongest of the three —
blocked client-side (`advance-approvals.ts:22`, beneficiary) AND by the DB
trigger `enforce_request_maker_checker` (approver ≠ requester); staff RLS scopes
`payment_requests` to the user's own `staff_id`. The **Expenses register is
genuinely read-only** (its only writes are the explicit reason-gated
CancelApproval + a Payouts link).

---

## HIGH

**H1 — `login_reset_requests` RLS was silently widened by a blanket migration.**
Lovable's `20260618065108_…sql` adds permissive `"Read <table>" … USING (true)`
SELECT + `"Manage <table>" … owner OR admin` ALL policies to many tables —
**including `login_reset_requests`**. RLS policies are permissive (OR'd), so these
coexist with and override the stricter June-15 policies (`20260615150000`): now
**any authenticated user can SELECT every login-reset request** (reason text, who,
when) and an **admin can INSERT/UPDATE/DELETE** them — including flipping
`status='approved'` directly, even though the actual credential reset
(`reset-user-password`) is owner-only (so an admin can record a *false* "approved"
with no reset performed). *Fix (Wrap):* a forward migration dropping the blanket
`login_reset_requests` policies and keeping the scoped June-15 set; verify which
other tables in that migration should not be world-readable. **(Lovable-introduced.)**

**H2 — Expense approve/reject: no status guard + no DB maker-checker → duplicate
accrual journals & client-only self-approval.** `ApproveExpenseDialog.tsx:86`
updates `expenses` with `.eq('id', …)` only — no `.eq('status','pending')` and no
rowcount check — and there is **no maker-checker/status trigger on `expenses`**
(the trigger covers `payment_requests` only). A double-click / retry / two
reviewers re-approves an already-approved expense and calls
`createExpenseApprovalEntry` **again**, posting a duplicate `expense_approval`
journal (ledger overstatement). Self-approval is blocked only in the dialog.
*Fix:* add `.eq('status','pending')` + rowcount check (claim-first, like the
settlement/payout fixes) and a DB trigger mirroring `enforce_request_maker_checker`.

**H3 — Advance approve/reject have no `status='pending'` predicate.**
`advance-approvals.ts:28,71` update `payment_requests` by `id` only. Two managers
(or a stale drawer) can both approve the same pending advance — the second
succeeds and re-notifies; reject-after-approve overwrites a terminal state.
*Fix:* `.eq('status','pending')`; treat 0 rows as "already actioned".

**H4 — `AmountInput` bypasses `toAmount` (cross-cutting money).**
`ui/amount.tsx:78-80` — `parseFloat(rawValue) || 0` after a mask that allows
**multiple dots** (`"1.2.3"`→`1.2`) and no finite/2-decimal rounding. Every money
field built on `AmountInput` (advance amount `NewRequest.tsx:97`, expense amount
`NewExpense.tsx`, …) can persist an un-rounded/garbage float into a money column —
exactly what `toAmount` exists to prevent. Pairs with the P2 finding that the
`Amount` *display* component also skips `toAmount`. *Fix:* route the parse through
`toAmount` (and reject multi-dot) — one change hardens every amount field.

**H5 — Multi-file expense proof is unviewable.** `NewExpense.tsx:198` stores
multiple proof paths **comma-joined** (`paths.join(',')`) into `proof_url`, but
`ExpenseDetailsDialog.tsx:39` passes the whole string to
`storage.createSignedUrl(proof_url, …)` as a single object key → fails for any
expense with >1 file ("Unable to load attachment"). *Fix:* store proofs as an
array/JSON (or render one signed link per comma-split path).

## MEDIUM

**M1 — Expense self-reject guards the wrong person.** `RejectExpenseDialog.tsx:41`
checks `expense.created_by === user?.id` (the *submitter*) while approve checks
`expense.staff?.user_id` (the *beneficiary*) — so a beneficiary whose expense was
keyed by a manager can reject their own claim, and a manager who keyed it for
someone else is blocked. Make reject use the same beneficiary rule.

**M2 — NewExpense: proof upload + insert not transactional; notify-failure
masquerades as create-failure.** `NewExpense.tsx:179-258` — uploaded files are
orphaned if the insert fails; and the `notify_users_by_role` call sits inside the
success `try`, so a notify error shows "Failed to create expense" for an expense
that WAS created → the user re-submits (duplicate). Same pattern in
`NewRequest.tsx:110-121`. *Fix:* move notify out of the critical path; clean up
uploads on insert error.

**M3 — NewRequest validation can fall through.** `NewRequest.tsx:79-89` — the
`requestSchema.parse()` try/catch only `return`s for a `ZodError`; a non-Zod throw
falls through to the insert with unvalidated data. Use `safeParse` + return on any
failure.

**M4 — No double-submit guard / no amount ceiling on new advance & expense.**
`NewRequest.tsx` / `NewExpense.tsx` — the submit button is disabled via
`isLoading`/`isSubmitting` but only *after* synchronous validation, so a fast
double-Enter can fire two inserts (no DB idempotency key on `payment_requests`/
`expenses`). The advance schema also has no `.max()` — a fat-finger
`99999999999` is accepted. *Fix:* a submitting ref at handler entry + a sane max
+ `.multipleOf(0.01)`.

**M5 — Advance reject has no self-guard (client or server).** `Requests.tsx:151` /
`advance-approvals.ts:62` — approve blocks self-benefit but reject doesn't, and the
DB trigger only polices the `approved` transition. A beneficiary-manager can reject
their own request. NEEDS-LIVE: confirm intent.

**M6 — Shared `rejectReason` state across two dialogs.** `Approvals.tsx` — the
advance-reject and login-reset-reject dialogs read/write one `rejectReason`;
residual text can carry between them. Use per-dialog state.

**M7 — GeoFlaggedPunches Accept/Reject has no client role gate.**
`components/attendance/GeoFlaggedPunches.tsx` renders mutating geo-review buttons
for anyone who can open Approvals, relying solely on `attendance_sessions` RLS.
NEEDS-LIVE: confirm the UPDATE policy restricts `geo_review` to owner/admin; else
gate client-side.

## LOW / NIT
- **L1** — paid advance still shows a live "Payouts" CTA (`Requests.tsx:287`) and
  approved expense shows "Pay via Payouts" (`Expenses.tsx:202`) with no per-item
  context. Hide once `paid_at`/`reimbursed`.
- **L2** — money rendered raw in confirm dialogs (`Approvals.tsx`,
  `Requests.tsx:482` `toLocaleString` vs `<Amount>`'s 2-dp) — inconsistent.
- **L3** — `DEFAULT_RESET_PASSWORD='123456'` is embedded in the staff
  notification body (`login-reset.ts`) — a readable record holding the literal
  password. Reconsider.
- **L4** — `canCreateRequest`/`canCreateExpense` are ever-growing role unions
  (`isStaff||isAccountant||isAdmin||isOwner`) — derive from a `can()` permission.
- **L5** — `status→tone` mapping duplicated in 3 places (Expenses, dialogs,
  StatusBadge) — drift risk.
- **L6** — a11y: NewRequest/NewExpense staff `<Select>` lacks an `id` matching its
  `<Label htmlFor>`; `Amount` colours every expense green ("money-in" tone).
- **NIT** — inconsistent `supabase` import (anyClient vs client) between sibling
  expense dialogs; dead `Upload` import in NewExpense.

---

## Recommended fix order (Wrap)
H4 (`AmountInput`→`toAmount` — one site, app-wide) → H2 + H3 (claim-first
`status='pending'` on expense & advance mutations; + the expense DB trigger) →
H1 (forward migration to re-scope `login_reset_requests` RLS — Lovable-introduced)
→ H5 (multi-file proof) → M1/M2/M3 → the rest. H1/H2's DB pieces and M5/M7 are
**NEEDS-LIVE** RLS items best confirmed in **P11**.
