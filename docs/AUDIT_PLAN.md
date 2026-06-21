# VIBRND HR BUDDY — Full Application Audit Plan

A phased, nothing-left-behind audit of the whole app. Each phase fits one
context window. Run one phase per fresh session by pasting that phase's prompt
(it tells the auditor to read the Rubric below first).

**Nature of the audit:** static — close code reading + `tsc` + `vitest` +
`vite build` + reasoning through edge cases + adding unit tests where logic is
pure. The live app/DB cannot be driven here (no login, no live DB), so anything
that genuinely needs a click is flagged **NEEDS-LIVE**, not marked passed.

**Inventory:** 33 pages / 34 routes · ~115 components · 28 lib modules · 13
hooks · 13 edge functions · 81 migrations · 122 tests.

---

## Audit Rubric (apply to every phase)

For each file in scope, READ it fully (don't assume), then check these ten
dimensions. Report every finding; don't fix during the audit pass.

- **A. Correctness & logic** — does each function do what its name/usage claims?
  Off-by-one, inverted conditions, wrong field/variable, stale closures, missing
  `await`, Promise.all error swallowing, `useEffect` deps, dead/unreachable code.
- **B. Money & accounting** — every numeric parse goes through `toAmount`;
  rounding is intentional; double-entry journals balance (debits = credits);
  proration (mid-month join/leave) correct; no NaN/negative leaks; settlement &
  journal immutability honoured; PF/ESI/PT caps & rates applied right.
- **C. Edge cases** — empty / null / undefined / zero / negative; mid-month
  join & leave; half-days, absences, comp-off, holidays, week-offs; short/leap
  months; very large numbers; duplicate/double submit; concurrent approve;
  already-settled month; staff with no login / no salary / inactive; first-run
  empty DB.
- **D. Permissions & security** — every mutating action gated by `can()`/role;
  the client gate matches the server RLS for that table; owner-only actions
  (e.g. password reset, payouts) enforced both sides; maker-checker /
  no-self-approval; client never reads a privileged table directly; edge
  functions verify the caller, validate input, and scope the service-role key;
  no secret/PII in logs or URLs.
- **E. Data integrity** — FKs & ON DELETE behaviour sane; `updated_at` + audit
  triggers present on mutable tables; immutable rows truly immutable; status
  transitions legal (no pending→paid skipping approve); orphan/cascade handled.
- **F. State & UX** — loading / error / empty states present; every mutating
  button disabled while in-flight (no double-fire); query invalidation / refetch
  after mutation; success AND failure toasts; destructive/irreversible actions
  behind a confirm dialog.
- **G. Forms** — required + format validation; numeric inputs via `toAmount`;
  reset on close/reopen; cannot submit invalid; sensible defaults.
- **H. Buttons & actions inventory** — ENUMERATE every button, menu item, link,
  and row action on each page; for each verify: (1) it does what it says, (2) is
  permission-gated, (3) is guarded against double/invalid use, (4) gives
  feedback. A button that renders but no-ops is a finding.
- **I. Accessibility** — icon-only controls have `aria-label`; inputs have
  associated labels; dialogs have titles.
- **J. Types / DB drift** — hand-edited `types.ts` blocks match their migration
  (columns, nullability, enums); note rows pending Lovable regen; flag any query
  selecting a column that doesn't exist.

**Finding format** (one line each, grouped by severity):
`[CRITICAL|HIGH|MEDIUM|LOW|NIT] path/file.tsx:line — what's wrong — why — suggested fix`

- CRITICAL = data loss / money wrong / security hole / crash on a main path.
- HIGH = wrong result on a real edge case, or a missing permission gate.
- MEDIUM = UX/state bug, missing guard, inconsistent behaviour.
- LOW/NIT = polish, a11y, naming, dead code.

**End every phase with:** `npx tsc --noEmit -p tsconfig.app.json`,
`npx vitest run`, `npx vite build`; a findings table; counts by severity; and a
short "recommended fixes / NEEDS-LIVE" list. Do NOT fix in the audit pass —
fixes are a separate, approved step.

---

## Phase map

| # | Phase | Primary scope | Risk |
|---|-------|---------------|------|
| P0 | Foundations & cross-cutting | AuthContext, permissions, utils/toAmount, query-keys, toast, shared UI (DataTable/FilterBar/StatusTabs/StatusBadge/Empty/Error/Skeleton), AppLayout nav+gating, route guards | ⚠️ systemic |
| P1 | Settlement engine + ledger (money core) | Settlements.tsx, settlement-engine.ts, journal-entries.ts, payroll.ts, payslip-pdf.ts, attendance-pay.ts, components/settlements/* | 🔴 highest |
| P2 | Batch payroll & payouts | PayrollGroups.tsx, Arrears.tsx, SalariesAdvances.tsx, Payouts.tsx, settlement-engine batch path | 🔴 |
| P3 | Advances, expenses, approvals | Requests.tsx, NewRequest.tsx, Approvals.tsx, advance-approvals.ts, login-reset.ts, Expenses.tsx, NewExpense.tsx, components/expenses+approvals/* | 🔴 |
| P4 | Attendance + pay-day engine | Attendance.tsx, MyAttendance.tsx, BulkAttendance.tsx, attendance.ts, attendance-pay.ts, bulk-attendance.ts, geofence.ts, discipline.ts, components/attendance/* | 🟠 |
| P5 | Biometric + attendance edge fns | BiometricEnrolment.tsx, hardware settings, useBiometric*, ingest-punches, rotate-device-key, check/mark-absent-staff, check-overtime-reminder | 🟠 |
| P6 | Leave, holidays, roster, shifts | LeaveRecords.tsx, Holidays.tsx, Roster.tsx, Shifts.tsx, leave.ts, holidays.ts, components/leave/*, useHolidays | 🟠 |
| P7 | Staff, users, rights | StaffList/Form/Details, staff-fields, staff-uploads, components/staff/*, UsersList, UserForm, RightsTemplates, components/users/*, create-staff-user/create-user/get-user/list-users/reset-user-password/migrate-owner-to-phone | 🟠 |
| P8 | Finance: ledger, petty cash, audit | Ledger.tsx, PettyCash.tsx, AuditLog.tsx, components/ledger/*, clear-transaction-data | 🟠 |
| P9 | Reports + builder + exports | Reports.tsx, components/reports/* (10), report-builder(.ts/-data.ts), attendance-reports.ts, report-export.ts, pdf-export.ts, ai-insights | 🟡 |
| P10 | Dashboards, settings, surface | Dashboard.tsx, components/dashboards/* (12), useDashboardStats, Settings.tsx, components/settings/* (13), Auth.tsx, Index, NotFound, pwa, notifications | 🟡 |
| P11 | Database & RLS sweep | all 81 migrations: RLS per table, SECURITY DEFINER fns, triggers, enums, types.ts drift | 🔴 |
| Wrap | Synthesis & fix execution | dedupe findings across phases, severity-rank, fix CRITICAL/HIGH (approved), re-verify | — |

Suggested order = the table order (foundations → money → ops → people →
finance/reporting → surface → DB). P0, P1 and P11 are the highest-leverage.
Settlements.tsx (1268 lines) and StaffForm.tsx (1255 lines) are large enough
that the auditor may split them into their own sub-pass — that's expected.

---

## Per-phase prompts (paste one per session)

### P0 — Foundations & cross-cutting
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P0 — foundations &
cross-cutting. Scope: src/contexts/AuthContext.tsx, src/lib/permissions.ts (+
the has_permission/get_my_permissions SQL), src/lib/utils.ts (toAmount),
src/lib/query-keys.ts, src/lib/toast.ts, src/components/ui/data-table.tsx,
filter-bar, status-tabs, status-badge, src/components/layout/* (AppLayout nav +
role gating, PageHeader, EmptyState, ErrorState, ListSkeleton), and the route
guards in src/App.tsx. Focus: does client `can()` exactly mirror server RLS for
every module; are nav items and routes gated consistently; is toAmount robust to
junk/locale/`null`; DataTable sort/paginate/empty correctness. Produce the
findings report; don't fix yet.
```

### P1 — Settlement engine + ledger (money core)
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P1 — settlement engine &
ledger. Scope: src/pages/Settlements.tsx (single-staff flow), src/lib/
settlement-engine.ts, journal-entries.ts, payroll.ts, payslip-pdf.ts,
attendance-pay.ts, src/components/settlements/*. Focus hard on dimension B
(money): proration on mid-month join/leave, PF/ESI/PT caps+rates, advance
adjustment + carry-forward, arrears fold-in, rounding, every journal balances
(debits=credits) and is immutable, payslip totals reconcile to net. Edge cases:
already-settled month, zero/negative net, no attendance, no salary structure.
Verify the engine unit tests cover what you find; note gaps. Findings report;
don't fix.
```

### P2 — Batch payroll & payouts
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P2 — batch payroll & payouts.
Scope: src/pages/PayrollGroups.tsx, Arrears.tsx, SalariesAdvances.tsx,
Payouts.tsx, and the batch path in src/lib/settlement-engine.ts
(gatherSettlementInputs/persistGroupSettlement/isMonthSettled). Focus: batch
settle doesn't double-post or skip the single-flow guards; payout execution
posts the correct ledger entry once and flips status pending→paid legally;
arrears pending→settled transition; group policy overrides (PF enrolment) apply
to members. Edge: partial group, member already settled, payout retry/double
click. Findings report; don't fix.
```

### P3 — Advances, expenses, approvals
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P3 — advances, expenses,
approvals. Scope: src/pages/Requests.tsx, NewRequest.tsx, Approvals.tsx,
Expenses.tsx, NewExpense.tsx, src/lib/advance-approvals.ts, login-reset.ts,
src/components/expenses/*, src/components/approvals/*. Focus: maker-checker /
no-self-approval on both client and DB; status lifecycle
(pending→approved/rejected→paid/reimbursed) has no illegal skips; the unified
Approvals inbox handles all three kinds (advance/expense/login_reset) correctly;
login-reset approve is owner-only and actually resets; notifications fire.
Edge: reject without reason, approve twice, expense in draft. Findings; don't fix.
```

### P4 — Attendance + pay-day engine
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P4 — attendance & pay-day
engine. Scope: src/pages/Attendance.tsx, MyAttendance.tsx, BulkAttendance.tsx,
src/lib/attendance.ts, attendance-pay.ts (computeDayBreakdown), bulk-attendance.ts,
geofence.ts, discipline.ts, src/components/attendance/*, the attendance hooks.
Focus: the day-breakdown maths — present/half/absent/paid-leave/off/comp-off and
how each maps to pay; no absence double-count; half-day stacking; holiday &
week-off interaction; geofence block-vs-flag; discipline fines. Edge: missing
check-out, overnight shift, multiple punches/day, bulk apply over a mixed range,
flagged-punch review. Verify engine tests cover the cases. Findings; don't fix.
```

### P5 — Biometric + attendance edge functions
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P5 — biometric subsystem &
attendance cron edge functions. Scope: src/pages/BiometricEnrolment.tsx, the
Hardware settings panel, src/hooks/useBiometricDevices.ts,
useBiometricEnrolment.ts, and supabase/functions/{ingest-punches,
rotate-device-key,check-absent-staff,mark-absent-staff,check-overtime-reminder}.
Focus (dimension D): device API-key hashing/rotation, ingest auth + input
validation + idempotency (no duplicate sessions), CORS, service-role scope, the
shared punch-normalize reducer. Edge: replayed punch, unknown device, clock skew,
partial batch. Findings; don't fix.
```

### P6 — Leave, holidays, roster, shifts
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P6 — leave, holidays, roster,
shifts. Scope: src/pages/LeaveRecords.tsx, Holidays.tsx, Roster.tsx, Shifts.tsx,
src/lib/leave.ts, holidays.ts, src/components/leave/*, useHolidays. Focus:
multi-leave-type quota/accrual/deduction and per-type balances; comp-off earn &
consume; holiday scope (org/branch/staff) + recurring expansion; roster week-off;
shift assignment. Edge: negative balance, overlapping leave, holiday on a
week-off, recurring across year boundary, balance carry-forward. Verify holiday &
leave tests. Findings; don't fix.
```

### P7 — Staff, users, rights
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P7 — staff, users, rights.
Scope: src/pages/StaffList.tsx, StaffForm.tsx (split into its own sub-pass if
needed), StaffDetails.tsx, UsersList.tsx, UserForm.tsx, RightsTemplates.tsx,
src/lib/staff-fields.ts, staff-uploads.ts, src/components/staff/*,
src/components/users/*, and supabase/functions/{create-staff-user,create-user,
get-user,list-users,reset-user-password,migrate-owner-to-phone}. Focus:
enrolment robustness (KYC upload required, partial failure rollback); non-owner
can't edit salary fields; rights-template resolution = (template ∪ granted) −
revoked; every user edge function verifies caller role + validates input. Edge:
duplicate employee_id/phone, staff without user, disabled designation/department.
Findings; don't fix.
```

### P8 — Finance: ledger, petty cash, audit log
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P8 — finance surfaces. Scope:
src/pages/Ledger.tsx, PettyCash.tsx, AuditLog.tsx, src/components/ledger/*, and
supabase/functions/clear-transaction-data. Focus: running-balance computation;
ledger immutability; petty-cash in/out balances and can't go negative
unintentionally; audit log is read-only and complete; clear-transaction-data is
owner-gated and scoped (must NOT touch staff/settings). Edge: legacy entries,
huge ledgers (pagination), filter combinations. Findings; don't fix.
```

### P9 — Reports + builder + exports
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P9 — reports & exports. Scope:
src/pages/Reports.tsx, src/components/reports/* (AttendanceReports,
ExpenseExplorer, AdvanceExplorer, TransactionsExplorer, TrialBalance,
CategoryWiseExpenseReport, EventWiseExpenseReport, StaffExpenseReport, AIInsights,
ReportBuilder), src/lib/report-builder.ts, report-builder-data.ts,
attendance-reports.ts, report-export.ts, pdf-export.ts, supabase/functions/
ai-insights. Focus: report numbers reconcile with their source-of-truth pages;
Excel/PDF export matches on-screen columns; report-builder permission gate +
saved-report data-permission re-check; trial balance actually balances. Edge:
empty result export, grouped sums, month-vs-day date filter. Verify report tests.
Findings; don't fix.
```

### P10 — Dashboards, settings, surface
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P10 — dashboards, settings &
surface. Scope: src/pages/Dashboard.tsx, src/components/dashboards/* (all 12),
useDashboardStats, useAttendanceSummary; src/pages/Settings.tsx,
src/components/settings/* (all 13 — hardware, holidays, leave types, masters,
geofence, payroll/statutory, data management); src/pages/Auth.tsx, Index.tsx,
NotFound.tsx, src/components/pwa/*, notifications. Focus: dashboard KPI maths
match the underlying pages; every settings panel saves+reloads and is
permission-gated; singleton-settings hook; auth flow (no credential mishandling).
Edge: empty DB first run, role-specific dashboards. Findings; don't fix.
```

### P11 — Database & RLS sweep
```
Read docs/AUDIT_PLAN.md (the Rubric). Audit Phase P11 — database & RLS sweep.
Scope: all of supabase/migrations/*.sql + src/integrations/supabase/types.ts.
For EVERY table: confirm RLS is enabled and the SELECT/INSERT/UPDATE/DELETE
policies match the app's intended access (cross-check against the client gates
found in P0–P10); confirm SECURITY DEFINER functions set search_path and don't
leak privilege; confirm audit + updated_at triggers exist where expected;
validate enums; and diff the hand-edited types.ts blocks against their migrations
(salary_arrears, designations, login_reset_requests, saved_reports, biometric_*)
noting anything Lovable regen would change. Findings; don't fix.
```

### Wrap — synthesis & fix execution
```
Read docs/AUDIT_PLAN.md and the P0–P11 findings. Deduplicate across phases,
re-rank by severity, and produce one consolidated audit report. Then (with my
go-ahead) fix CRITICAL and HIGH findings in small verified commits, add
regression tests for each, and re-run tsc + vitest + build. List NEEDS-LIVE
items I must click-test myself.
```

---

## How to run

1. Run phases in order, one per fresh session, by pasting that phase's prompt.
2. Each phase ends with a findings report (no fixes yet) saved under
   `docs/audit/PHASE-Px-findings.md` so they accumulate.
3. After P11, run the Wrap prompt to consolidate and then fix in approved batches.
4. Track progress in the checklist below.

### Progress
- [x] P0 Foundations — docs/audit/PHASE-P0-findings.md (3 High, 5 Medium, 6 Low)
- [x] P1 Settlement engine + ledger — docs/audit/PHASE-P1-findings.md (1 Critical, 3 High, 8 Medium, 3 Low)
- [x] P2 Batch payroll & payouts — docs/audit/PHASE-P2-findings.md (1 Critical, 5 High, 7 Medium, 6 Low)
- [x] P3 Advances, expenses, approvals — docs/audit/PHASE-P3-findings.md (5 High, 7 Medium, 7 Low)
- [ ] P4 Attendance + pay-day engine
- [ ] P5 Biometric + edge functions
- [ ] P6 Leave, holidays, roster, shifts
- [ ] P7 Staff, users, rights
- [ ] P8 Finance: ledger, petty cash, audit
- [ ] P9 Reports + builder + exports
- [ ] P10 Dashboards, settings, surface
- [ ] P11 Database & RLS sweep
- [ ] Wrap synthesis & fixes
