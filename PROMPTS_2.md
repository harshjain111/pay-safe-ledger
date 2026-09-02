# HR Buddy — Attendo Parity Rebuild

Phase-by-phase build prompts for Claude Code.

**Reference app:** Attendo (PetPooja Payroll) at `payroll.petpooja.com`, walked live 02 Sep 2026 — all 11 modules.
**This repo:** `pay-safe-ledger`, read at commit `45d7734`.
**Org:** Konnect 2 Hospitality Pvt. Ltd. — 214 staff, outlets Ballu / Mirosh / Reality / TD.

---

## How to use this file

1. Run **one phase per Claude Code session.** They are long and each ends with a review gate.
2. **Paste the Context Block (below) at the top of every phase prompt.** Claude Code starts
   fresh each session and will otherwise rebuild things that already exist in this repo.
3. Run them **in order.** Several phases are only safe once an earlier one has landed —
   Phase 8 in particular will break payroll if run early.
4. **Phase 0 ships alone, first.** It surfaces a live payroll-correctness bug. Everything
   else is cosmetic next to an app that pays staff who never showed up.

### Order and dependencies

| Phase | What | Blocked by |
|---|---|---|
| 0 | Fix the live absence bug | — |
| 1 | Pattern library | — |
| 2 | Navigation restructure | 1 |
| 3 | **Process Payroll** — the centrepiece | 1, 2 |
| 4 | Finalized Payroll + Salary Increments | 3 |
| 5 | The payslip (exact format) + its two surfaces | 1 |
| 6 | Settlements group | 1, 2 |
| 7 | Employee record — leaving date, salary history | 1 |
| 8 | Deletions | 3, 4, 6 |
| 9 | Outlet-scoped Manager role | 8 |

### Open questions — do not guess

> Client answers recorded 03 Sep 2026 — items marked RESOLVED are settled.

- **PAID DAYS arithmetic. RESOLVED.** Paid days follow the calendar month. Week-offs are
  calendar-driven from the assigned weekly-off day: a Monday week-off in a month with
  5 Mondays yields 5 week-offs, not a fixed 4. In a 28-day month with 4 week-offs the
  employee must attend the other 24 days for full salary — i.e. working days =
  daysInMonth − (week-off occurrences in that month), and
  paidDays = min(daysInMonth, present + half×0.5 + paidLeave + weekOffs-in-month).
  The Phase 5 formula stands; the sample slip's 27+4=31 is explained by the cap.
- **Shifts. RESOLVED (for now): KEEP.** Do not delete Shifts in Phase 8 step 6; the client
  will decide later. Only the Roster page is deleted there.
- **Activity Log.** Keep or drop? Recommended keep — HR now locks sheets and managers
  override attendance.
- **Departments. RESOLVED (deferred).** "F & B" can be created later as a department
  master when needed; no rename/mapping work now.
- **SL / CL leave types.** The payslip prints `Bal. SL/CL` but no such leave types exist.
  Create them, or print `0.00/0.00` permanently? (Phase 5 default: print 0.00/0.00,
  never throw.)

---

## CONTEXT BLOCK

> Prepend this verbatim to **every** phase prompt.

```
PROJECT: HR Buddy (repo: pay-safe-ledger). Vite + React 18 + TypeScript + shadcn/ui +
Tailwind + Supabase. Org: Konnect 2 Hospitality Pvt. Ltd., 214 staff, outlets Ballu /
Mirosh / Reality / TD. Departments ADMIN / KITCHEN / SERVICE.

GOAL: the app is feature-rich but disorganised and confusing. We are restructuring its
navigation and interaction patterns to match Attendo (PetPooja Payroll), REUSING the
business logic that already exists. Use Attendo's vocabulary exactly — "Process Payroll"
is the working screen, "Finalized Payroll" is the record. Never two page names sharing
a word.

THESE ALREADY EXIST AND WORK. REUSE THEM. DO NOT REBUILD OR DUPLICATE:
- src/lib/settlement-engine.ts — pure, unit-tested computeSettlement(),
  gatherSettlementInputs(), persistGroupSettlement(). This IS the payroll engine.
- src/pages/PayrollGroups.tsx runBatch() — a working bulk-settle loop.
- src/lib/payslip-pdf.ts — drawPayslip / downloadPayslipPDF / downloadBulkPayslipsPDF.
- src/pages/MySalarySlips.tsx at /my-payslips — employee self-service surface.
- src/lib/journal-entries.ts — createSalarySettlementEntry, createArrearsEntry.
- src/lib/payroll.ts getLoanEMIsForMonth() — loan EMI recovery.
- src/lib/attendance-pay.ts computeDayBreakdown() — attendance → paid days.
- salary_sheet_locks table + enforce_salary_sheet_lock trigger — month lock.
- salary_history table + bulk_update_salaries RPC — the ONLY writer of increment history.
- salary_arrears table — fully wired create / pay / cancel + journal posting.
- staff.date_of_leaving, staff.separation_reason, trigger staff_sync_status().
- payroll_statutory_settings, hr_pay_rules, discipline_rules — the rules tables.
- permissions / rights_templates / user_permissions + has_permission() — RBAC.
- is_leave_of_my_report() — manager leave-approval RLS.
- log_bulk_attendance_adjustment() — audits bulk attendance overrides.

HOUSE RULES FOR EVERY PHASE:
- Reuse existing shadcn tokens and the Tailwind config. Do not introduce a new palette.
- Every mutation writes to audit_log.
- All money is computed through settlement-engine.ts. Never write a second implementation.
- Finalized payroll is an immutable snapshot; changing a rule later must never alter a
  past run.
- Do not touch: /dashboard /staff /users /rights-templates /biometric-enrolment
  /attendance /week-off /leave-records /leave-assign /leave-balance /approvals /ledger
  /audit-log /settings — except where a phase explicitly says so.
- When done, list the files changed and the routes now working, then STOP for review.
```

---

## PHASE 0 — Fix the live payroll bug

**Ship alone, before anything else.**

```
PHASE 0 — fix a live payroll-correctness bug. Ship this alone, no other changes.

THE BUG
In src/lib/attendance-pay.ts, computeDayBreakdown() classifies each day like this:

    if (isHoliday)             isOff = true;
    else if (rosterRow)        isOff = rosterRow.is_off || !rosterRow.shift_id;
    else if (unscheduledIsOff) isOff = true;
    else                       isOff = weeklyOffDay != null && getDay(d) === weeklyOffDay;

Three facts stack up in this database:
  1. The `shifts` table is empty (the Shifts page shows "No shifts").
  2. `staff_roster` is therefore empty — rosterRow is undefined for every day.
  3. All 214 staff have staff.weekly_off_day NULL (Week Off shows "No weekly off").
And hr_pay_rules.unscheduled_is_off defaults to TRUE (read as
`payRules?.unscheduled_is_off ?? true`).

Result: EVERY day of EVERY month is classified as a paid off-day. workingDays collapses
toward zero and absentDeductionDays never accrues. Verified in live data — ABDUL ZAHER,
August 2026: "Present 0 · Paid leave 0 · Off 6 · Absent 0", net Rs 12,540 against a
Rs 12,650 monthly salary, with zero check-ins all month.

Separately, /leave-records reports "393 absent days pending assignment" — unclassified
absences that also deduct nothing.

WHAT TO BUILD (surface the problem; do NOT silently change the default)
1. A reusable <PayrollDataIntegrityBanner /> component. Given an outlet filter and a date
   range it checks and reports, as a dismissible warning card:
   a. Staff who have NEITHER staff.weekly_off_day set NOR any staff_roster row inside the
      period. List names + employee codes, with a count and a link to /week-off.
      Copy: "N staff have no weekly off and no roster for this period. Their absences will
      not be deducted."
   b. The count of leave_records rows in the period awaiting type assignment, linking to
      /leave-records. Copy: "N absent days are not yet assigned a leave type. They will not
      deduct until assigned."
   c. Staff with monthly_salary null or 0, linking to /staff.
   Render it at the top of /settlements today, and later at the top of Process Payroll.

2. On /week-off: the "Default weekly off for everyone" + "Apply to all" control already
   exists in the UI but has never been used. Make sure it works end to end — writes
   staff.weekly_off_day for every selected staff row, shows a confirm dialog naming how
   many staff will be changed, and writes an audit_log entry.

3. Add a unit test in src/lib/attendance-pay.test.ts proving the failure mode:
   given no roster row, no weekly off, and unscheduled_is_off = true, a month of zero
   check-ins currently produces absentDeductionDays === 0. Assert the current behaviour so
   the bug is documented, and add a second test showing that with weekly_off_day set, the
   same month correctly produces absent days.

DO NOT change the default value of unscheduled_is_off, and do not alter the branch order in
computeDayBreakdown. This phase makes the problem visible and gives the user the tool to fix
their data. Changing pay logic silently would restate every historical settlement.
```

---

## PHASE 1 — The pattern library

**Do not skip this.** It is the entire difference between this app and Attendo.

```
PHASE 1 — build the pattern library. No screens yet.

Every list page in this app currently invents its own header, filter bar, table chrome and
detail view. That inconsistency IS the usability problem. Build these primitives in
src/components/patterns/ and export them from an index. From Phase 2 onward, no page may
hand-roll any of them.

1. <PageHeader title count actions />
   "Title (count)" on the left, count in the accent colour inside parentheses and live.
   Right-aligned action slot: outline buttons first, then exactly ONE primary button.
   Identical geometry on every page.

2. <FilterBar> + <DateRangeField>
   A horizontal row: scope selects (outlet, department, status...) -> <DateRangeField> ->
   a primary "Search" button. Right-hand slot for <ActionsMenu>.
   <DateRangeField> prints the inclusive day count immediately beside the range,
   e.g. "01 Aug 2026 -> 31 Aug 2026   31 Days".
   CRITICAL: filters DO NOT auto-apply. Nothing queries until Search is pressed. The
   component owns draft filter state and only lifts it on Search. This makes heavy queries
   cheap and makes the user feel in control.

3. <ActionsMenu>
   A dropdown labelled "Actions" holding Export Excel and Export PDF by default, plus any
   page-specific items. Disabled when there is no result set. One shared export utility —
   do not reimplement export per page.

4. <DataTable>
   Props: columns, rows, stickyColumns (number of frozen left columns), selectable,
   cellTone (per-cell 'positive' | 'negative' | undefined for green/red tint),
   configurableHeaders, loading, empty.
   Requirements: sticky left columns with a right box-shadow edge; row height ~30px;
   font-variant-numeric: tabular-nums; money right-aligned; the table scrolls horizontally
   inside its OWN container so the page body never scrolls sideways.
   Built-in footer: "Showing X-Y of Z" + a page-size select (10/20/50/100) + a pager.
   Optional selection footer bar showing "N selected" plus a summary slot.

5. <Drawer>
   A right-hand offcanvas over a dimmed backdrop. Sizes sm 380px / md 560px / lg 640px.
   Tinted header bar: title left, close X right. Primary action pinned to the bottom.
   MUST support stacking — a drawer opened from inside a drawer, unwinding cleanly with
   Escape and with the backdrop click.
   From now on, detail views NEVER navigate to a new route. The list stays behind the
   drawer with its scroll position and filters intact.

6. <ConfigurableHeader>
   A table column header rendered with a coloured underline, which on click opens a rules
   <Drawer>. Every rules drawer ends with a <ConfigHistory> table
   (Modified / By / Field / Old / New) read from audit_log for that settings table.
   This is the single most important pattern to get right — it is how payroll rules get
   edited from the number they produced, instead of from a distant settings page.

7. <RowMenu>
   The kebab menu. Accepts 2-5 items, supports a destructive variant. Replaces every inline
   row button in the app.

8. <EmptyState title instruction icon />
   The instruction MUST name the control the user should use, e.g. "Choose a date range
   above and press Search." Never a bare "No data found."

9. <InlineNote>
   The persistent grey rule note that sits under a filter bar, e.g. "Finalized months are
   locked. De-finalize from Finalized Payroll to make changes."

10. <ColumnChooser>
    Attendo's "Edit Columns": a drawer of checkboxes for every available column, with
    "Reset To Default" and "Save". Persist the choice per user (localStorage keyed by
    page id is fine).

11. <ConfirmDestructive>
    Attendo's delete pattern: names the specific record, states the action is irreversible,
    requires the user to type a confirmation string, and uses the buttons "Go Back" and
    "Proceed".

Write a demo route at /patterns (dev only, not in nav) that renders one example of each so
they can be reviewed together. Add unit tests for <FilterBar>'s "nothing loads until Search"
behaviour and for <DataTable> sticky-column rendering.
```

---

## PHASE 2 — Navigation

```
PHASE 2 — restructure navigation from 28 routes across 9 groups to 11 items across 5.

Rewrite roleNavSections in src/components/layout/AppLayout.tsx (Owner branch first, then
mirror the changes into the admin / hr / accountant / ca / staff branches) to:

  Dashboard
  EMPLOYEES      Employees / Biometric Enrolment
  ATTENDANCE     Bulk Attendance Adjustments / Attendance / Week Off
  LEAVE          Leave Records / Leave Assign / Leave Balance
  Approval Requests            (with the pending-count badge)
  PAYROLL        Process Payroll / Finalized Payroll / Salary Increments / Salary Slips
  SETTLEMENTS    Advances / Advance Payouts / Arrears / Transaction Log / Ledger
  Reports
  Activity Log
  ADMIN          Users / Rights Templates / Settings

REMOVE from every nav branch: Shifts, Duty Roster, Holidays, Petty Cash, Expenses,
Payroll Groups. Do NOT delete their routes or code yet — that is Phase 8. For now register
redirects so no bookmark 404s:
  /shifts, /roster        -> /bulk-attendance
  /holidays               -> /leave-records
  /petty-cash, /expenses  -> /ledger
  /payroll-groups         -> /payroll/process   (once Phase 3 exists; until then /settlements)
  /salaries-advances      -> /payroll/process   (once Phase 3 exists)

RENAMES (labels and route paths both):
  "Staff"              -> "Employees"        (keep /staff route, relabel only)
  "Approvals"          -> "Approval Requests"
  "Audit Log"          -> "Activity Log"
  "Bulk Attendance"    -> "Bulk Attendance Adjustments"
  /payouts             -> /settlements/payouts, labelled "Advance Payouts"
  /arrears             -> /settlements/arrears
  New paths for Phase 3+: /payroll/process, /payroll/finalized, /payroll/increments,
  /payroll/salary-slips, /settlements/advances, /settlements/log

Update src/lib/route-permissions.ts ROUTE_PERMISSIONS for every new path, preserving the
existing permission keys:
  /payroll/process      -> settlements.run
  /payroll/finalized    -> settlements.run
  /payroll/increments   -> salaries.edit
  /payroll/salary-slips -> payslips.download
  /settlements/*        -> the keys currently used by /arrears and /payouts

Put Bulk Attendance Adjustments FIRST in the Attendance group — it is where outlet managers
will spend their time.

Verify: the nav filter getNavSections() still hides items whose permission the user lacks,
and RequirePermission still guards each route.
```

---

## PHASE 3 — Process Payroll (the centrepiece)

```
PHASE 3 — build /payroll/process, the single screen where payroll actually happens.
It replaces /salaries-advances, the per-staff /settlements page, and PayrollGroups'
"Batch Settle" tab. This is the most important phase in the project.

WHY: today, to pay 214 staff, a user opens /salaries-advances, scrolls 214 tiles, clicks
Settle on one, is NAVIGATED AWAY to /settlements?staff=...&month=..., reads a calculation,
chooses between three override fields, settles, navigates back, and loses their scroll
position. Roughly seven interactions and two page loads per person. Attendo's equivalent is:
pick a scope, pick a date range, press Search, read one grid, press Finalize.

STEP 3A — UNIFY THE FORMULA FIRST. Do this before writing any UI.
src/pages/Settlements.tsx contains calculateSettlement() (~lines 206-458), a hand-synced
~250-line duplicate of computeSettlement() from src/lib/settlement-engine.ts. The engine's
own header comment admits it: "The single-staff screen has NOT yet been refactored onto
it... unify once verified on a real deploy."
Two implementations of one payroll formula WILL drift, and when they do, batch settle and
single settle will pay different amounts for the same person.
Delete the inline duplicate. Route the per-staff path through settlement-engine.ts. Extend
the engine's ComputeOpts if the per-staff screen genuinely needs an option the batch path
lacks. Run the existing settlement-engine.test.ts and add cases covering whatever the
per-staff path did that the engine did not. Do not proceed to 3B until tests pass.

STEP 3B — THE SCREEN.
Use the Phase 1 primitives throughout. Hand-rolling any of them is a bug.

<PageHeader> : title "Process Payroll", live count of rows in scope.
  Actions, left to right: [Lock Sheet] outline / [Actions] outline / [Finalize N Selected]
  primary, disabled at zero selection.
  "Lock Sheet" toggles the salary_sheet_locks row for the selected month (this control
  currently lives on /salary-slips — move it here, where the work is). Gated on the existing
  settlements.lock permission.

<PayrollDataIntegrityBanner> from Phase 0, directly beneath the header.

<FilterBar> : Outlet / Department / <DateRangeField> with day count / Search.
<InlineNote> : "Finalized months are locked. De-finalize from Finalized Payroll to make
changes."

<DataTable>, selectable, with 3 sticky left columns:
  [checkbox] | Employee (full name, then "K2H136 - HOUSEKEEPING" as a sub-line) | Role +
  outlet (department, then outlet as a sub-line)

Scrolling columns, in exactly this order:
  Present | Half | Off | Leave | Absent
      -> cellTone: Present/Half/Off/Leave = positive (green tint), Absent = negative (red)
  Salary | Daily Wage | Earned
  Leave Ded | Penalties
  PF | ESI | PT
  Advance | Loan EMI | Arrears
  NET PAYABLE (bold) | Status (pill: Pending / Settled / Paid) | kebab

All values come from gatherSettlementInputs() + computeSettlement() per row. Compute in
parallel with a concurrency cap (say 8) and show skeleton rows while loading.

CONFIGURABLE HEADERS — use <ConfigurableHeader> on these, each opening a rules <Drawer>
that writes to the EXISTING settings table and recomputes the visible grid on save:
  Present / Half / Off / Absent -> hr_pay_rules
      full_day_minutes, half_day_minutes, unscheduled_is_off, comp_off_enabled
  Penalties                     -> discipline_rules
      penalties_enabled, grace_minutes_in/out, late_in_slabs, early_out_slabs,
      late_in_full_day_after_min, late_in_half_day_after_min, absent_no_checkin_deduction
  PF                            -> payroll_statutory_settings
      pf_enabled, pf_employee_rate, pf_employer_rate, pf_base_cap, pf_calc_base
      (basic|gross), pf_default_enroll
  ESI                           -> payroll_statutory_settings
      esi_enabled, esi_employer_rate, esi_eligibility_ceiling, esi_calc_base
  PT                            -> payroll_statutory_settings
      pt_enabled + the West Bengal monthly slab table (gross-up-to / amount rows)
Every drawer ends with <ConfigHistory> reading audit_log for that table. Gate the drawers on
settings.payroll.edit / settings.attendance.edit as appropriate; show the values read-only
to users without the permission rather than hiding the drawer.

ROW MENU: Preview / Adjust / View Attendance / Ledger
  Preview  -> a lg <Drawer> rendering the payslip breakdown for that row, using the same
              data shape payslip-pdf.ts consumes. Sections: Gross Earnings, Other Earnings,
              Employee's Contribution, Deductions — each a Heads / Payment Type / Amount
              table. Include a "Download PDF" action.
  Adjust   -> a md <Drawer> writing an explicit adjustment line: amount (+/-), a MANDATORY
              reason, and an audit_log entry. See the deletion note below.
  View Attendance -> deep link to /bulk-attendance filtered to that staff + period.
  Ledger   -> deep link to that staff member's ledger.

SELECTION FOOTER: "N selected - Net total Rs X" on the left, standard pagination on the
right.

FINALIZE: loop the selected rows through gatherSettlementInputs -> computeSettlement ->
persistGroupSettlement. Lift the logic from PayrollGroups.tsx runBatch() VERBATIM — it
already guards against double-settling via isMonthSettled(), handles per-row failures, and
returns a {done, failed} summary. Show a progress dialog with a live counter and, at the
end, a summary listing any failures with their reasons. Refresh the grid.

DELETE THE THREE OVERRIDE FIELDS from the old per-staff screen. Do not port them:
  - "Final Deduction (Owner Override)"
  - "Desired Net Payable (Optional) -> Override"
  - "Override absent days"
Three manual overrides on one form tell the user the computed number cannot be trusted.
The middle one is actively wrong: handleNetPayableOverride reverse-solves
leave_deduction = monthlySalary - advanceAdj - desiredNet and back-calculates deduction
days from it, IGNORING PF, ESI, PT, discipline fines, absent deduction, overtime and bonus —
so the recomputed net drifts from the number the user typed. Delete it.
Attendo has zero overrides on its payroll grid. Corrections happen upstream in Bulk
Attendance Adjustments, where the wrong attendance actually is. The single audited "Adjust"
drawer above is the only escape hatch.

Finally: make /salaries-advances and /payroll-groups redirect here.
```

---

## PHASE 4 — Finalized Payroll + Salary Increments

```
PHASE 4 — two supporting payroll screens. Use the Phase 1 primitives.

SCREEN A — /payroll/finalized, titled "Finalized Payroll"
Today the app cannot answer "what did we pay last month?". This screen answers it.

<PageHeader> "Finalized Payroll (N)".
<FilterBar>  Outlet / <DateRangeField> / Search. <ActionsMenu> exports.
<DataTable>  From | To | Outlet | Net Finalized | Finalized On | Finalized By | Paid Amount |
             Paid On | Status pill | kebab
Group salary_settlements rows by (settlement_month, outlet) to form one row per run, or add
a payroll_run table if you judge grouping too fragile — if you add one, backfill it from the
existing settled rows and keep salary_settlements as the line-item store.

Row menu:
  View snapshot -> lg <Drawer> listing every employee line in that run, read-only, with the
                   same columns as Process Payroll. Export from the drawer.
  De-finalize   -> <ConfirmDestructive>. Deletes the salary_sheet_locks row for that month,
                   flips the settlements back to editable, and writes an audit_log entry
                   naming who did it and why (mandatory reason). Gated on settlements.lock.
  Mark as Paid  -> records paid_amount / paid_at / paid_by on the settlements and pushes the
                   resulting payment_requests to /settlements/payouts.

SCREEN B — /payroll/increments, titled "Salary Increments"
Reads the EXISTING salary_history table (staff_id, monthly_salary, effective_from,
effective_to, change_reason, changed_by).

<PageHeader> "Salary Increments (N)". Actions: [Actions] / [Revise Selected] primary.
<FilterBar>  Outlet / Department / Status (All | Due | Not due) / Search.
<DataTable>, selectable:
  Employee | Current Salary | Previous Salary | Change Rs | Change % | Last Revised |
  Months Since | Due
  - "Last Revised" = the effective_from of the latest closed salary_history row.
  - FOR STAFF WITH NO SALARY HISTORY, MEASURE MONTHS SINCE FROM staff.date_of_joining.
    Confirmed by the client. Show "Never revised" in the Last Revised column for them.
  - "Due" = a pill, and the whole row gets an amber cellTone, when Months Since >= 12.
  - Sort by Months Since descending by default — the most overdue at the top.

Row menu -> "Revise Salary": a md <Drawer> with New Monthly Salary, Effective From (date),
Reason (mandatory). Header action "Revise Selected" opens the same drawer for a multi-select,
applying either a flat amount or a percentage to all selected.
BOTH paths MUST call the EXISTING bulk_update_salaries RPC. That RPC is the only writer of
salary_history — it closes the open row's effective_to and inserts a new one. Do not write
to staff.monthly_salary directly or increment history silently stops being recorded.

NOTIFICATION + DASHBOARD CARD
- A dashboard card for Admin and HR: "N staff are due a salary review" linking here.
- A notification (use the existing notifications table and notify_users_by_role) fired when
  a staff member crosses 12 months since their last revision, or since joining if they have
  never had one. Fire once per staff per crossing — do not re-notify daily. A daily
  Supabase scheduled function or an on-load check with a last_notified marker are both fine;
  pick one and say which.

This screen REPLACES src/components/salary/BulkSalaryDialog.tsx. Do not delete that file
yet — Phase 8 does, once this is verified working.
```

---

## PHASE 5 — The payslip

```
PHASE 5 — rewrite the payslip PDF to Konnect 2's exact format, and give it two surfaces.

PART A — THE LAYOUT
Rewrite drawPayslip() in src/lib/payslip-pdf.ts. Keep the file's plumbing (lazy jsPDF
import, downloadPayslipPDF, downloadBulkPayslipsPDF with one page per staff). A4 portrait,
serif face throughout (Times), black on white.

REMOVE from the current implementation — the client has confirmed these are not wanted:
  - the QR verification code and its "Scan to verify" caption
  - the GSTIN / EPF / ESI registration line in the header
  - the "Employer Contribution" footer note
  - the "PAYSLIP" title and the "Pay Period:" line

BUILD, top to bottom:

  Centered, bold, 17pt : organization_profile.legal_name
                         -> "Konnect 2 Hospitality Pvt. Ltd."
  Centered, 11pt       : address, city, pincode on one line
                         -> "10th Floor, Usha Kiran Building, 12a, Camac Street, Elgin,
                             Kolkata - 700017"
  Dashed horizontal rule
  Centered, bold, 14pt : "Salary Slip for Month Of {MONTH_NAME_UPPERCASE} {YYYY}"
                         -> "Salary Slip for Month Of FEBRUARY 2026"
  Dashed horizontal rule

  TWO-COLUMN IDENTITY BLOCK. Format each line as "Label  :  Value", value in bold.
  LEFT COLUMN:
    Employee Code      staff.employee_id
    Brand              organization_profile.brand_code            [NEW COLUMN — see Part B]
    City               organization_profile.city
    Department         staff.department
    Designation        staff.designation
    Company Join Date  staff.date_of_joining, formatted 01/DECEMBER/2025
  RIGHT COLUMN:
    Employee Name      honorific + staff.full_name, e.g. "Mr. ABID ALI KHAN"
    EMPLOYEE STATUS    staff.status, title-cased -> "Active"
    UAN                staff.uan_number
    PAN NO.            staff.pan_number
    ESIC NO.           staff.esic_number
    LWP DAYS           unpaid leave days, 2dp -> "0.00"
    PRESENT DAYS       settlement.present_days -> "27 DAYS"
    PAID DAYS          see the formula in Part B -> "28 DAYS"
    W.Off/Pd.C         settlement.off_days / settlement.comp_off_earned -> "4.00/0.00"
    Bal. SL/CL         leave_balances for leave-type codes SL and CL -> "0.00/0.00"
    Bal. PL            leave_balances for the default paid-leave type -> "0.50"

  EARNINGS TABLE — five columns:
      Earnings | Normal | Salary | Supplementary | Total
    Column meanings (confirmed by the client):
      Normal        = the full-month entitlement — staff.basic_salary, staff.hra,
                      staff.other_allowances
      Salary        = what attendance actually earned this month —
                      settlement.earnings_basic, earnings_hra, earnings_allowances
      Supplementary = off-cycle additions
      Total         = Salary + Supplementary
    Rows:
      Basic            | staff.basic_salary     | settlement.earnings_basic      | 0.00 | sum
      HRA              | staff.hra              | settlement.earnings_hra        | 0.00 | sum
      Other allowance  | staff.other_allowances | settlement.earnings_allowances | 0.00 | sum
      Then ONE ROW PER non-zero supplementary item, with Normal 0.00 and Salary 0.00 and the
      value in Supplementary: Arrears (settlement.arrears when positive), Incentives
      (settlement.incentives), Bonus (settlement.bonus), Overtime
      (settlement.overtime_amount)
      Then a bold, ruled "Grand Total" row summing all four columns.
    If the staff member has no salary structure (basic/hra/allowances all zero), fall back to
    a single "Earned Salary" row using settlement.base_salary, as the current code does.

  DEDUCTIONS TABLE — identical five columns. ITEMISE, one line each, ONLY when non-zero.
  The client's legacy slip lumped everything except PT into "OTHER"; they have chosen
  itemised instead.
      Professional Tax    settlement.pt_amount
      PF Employee         settlement.pf_employee
      ESI Employee        settlement.esi_employee
      Leave Deduction     settlement.leave_deduction   (append " (N d)" using leave_days)
      Absent Days         settlement.absent_deduction  (append " (N d)")
      Discipline Fine     settlement.discipline_fine
      Loan EMI            settlement.loan_emi_total
      Advance Adjustment  settlement.advances_adjusted
      Arrears Recovery    abs(settlement.arrears) when arrears is negative
    Then a bold, ruled "Grand Total" row.

  RIGHT-ALIGNED SUMMARY BLOCK:
      Gross Earnings  :  {earnings grand total}
      Gross Deduction :  {deductions grand total}
      Net Payable     :  {settlement.balance_payable}
  Dashed rule
  "Net Payable (In Words) : {UPPERCASE WORDS} ONLY"
      -> "Net Payable (In Words) : TWELVE THOUSAND FOUR HUNDRED SEVENTY NINE ONLY"
  Italic, 10.5pt:
  "Note : Private and Confidential. This is computer generated slip hence signature is not
   required."

  Numbers throughout: two decimals, no currency symbol, no thousands separators inside the
  tables (match the sample: 13500.00, not Rs 13,500.00).

PART B — NEW PIECES REQUIRED
1. Migration: add organization_profile.brand_code TEXT. Seed it "K2H". Expose it as a field
   under Settings -> Organisation. (Note it matches the employee-code prefix K2H###, so it
   could be derived instead — but a column is simpler and explicit.)
2. src/lib/number-to-words.ts — numberToWordsIndian(n): Indian numbering (thousand, lakh,
   crore), UPPERCASE output, no "rupees", caller appends " ONLY". Round to the nearest
   rupee. Unit-test 0, 1, 19, 20, 99, 100, 999, 1000, 12479, 100000, 1234567, 10000000.
3. Honorific helper from staff.gender: Male -> "Mr. ", Female -> "Ms. ", anything else ->
   "" (no prefix).
4. PAID DAYS formula:
      paidDays = min(daysInMonth,
                     present_days + (half_days * 0.5) + paid_leave_days + off_days)
   NOTE FOR THE DEVELOPER: the client's sample slip shows PRESENT DAYS 27, PAID DAYS 28 and
   W.Off 4.00 for February 2026 — a 28-day month, where 27 + 4 = 31 exceeds the month. This
   is unresolved. Implement the formula above (it reproduces 28 for that employee), put the
   calculation in one clearly-named function, and flag the discrepancy in your summary so it
   can be corrected in one place once the client confirms their definition.
5. Bal. SL/CL: read leave_balances joined to leave_types where code IN ('SL','CL'). Those
   leave types do not currently exist in this org. If absent, print "0.00/0.00" — do not
   throw, do not omit the line.

PART C — WHERE IT LIVES. Two surfaces, one generator.

EMPLOYEE APP — /my-payslips (src/pages/MySalarySlips.tsx already exists and is routed in the
self-service section). Rebuild it to the Phase 1 primitives and enforce:
  - Lists ONLY the signed-in employee's own months, newest first.
  - A month appears ONLY once its settlement is finalized (a salary_sheet_locks row exists
    for it, or status is settled and paid — pick the stricter). NEVER show a draft payslip;
    an unfinalized slip in an employee's hands is a dispute waiting to happen.
  - One "Download" per month. NO bulk download on this surface. No other employee's data,
    ever.
  - Enforce server-side, not just in the query: the settlement read must be RLS-restricted
    to staff_id = get_user_staff_id(auth.uid()). Verify the policy exists; add it if not.
  - Mobile-first layout — this is the app staff are actually given.

HR / ADMIN WEB — /payroll/salary-slips:
  - Any employee, any finalized month. Single download and bulk multi-page download.
  - <PageHeader> + <FilterBar> (Outlet / Month / Search) + <DataTable> + <ActionsMenu>.
  - Gated on the payslips.download permission. The built-in HR template already has it.
    ADD payslips.download TO THE ADMINISTRATOR TEMPLATE — the client wants both roles to
    have it, and Administrator is currently scoped "no salaries".
  - The "Lock salary sheet" button moves OFF this page to Process Payroll (Phase 3).
```

---

## PHASE 6 — Settlements

```
PHASE 6 — rebuild the Settlements group on the Phase 1 primitives.

/settlements/advances — "Advances"
<PageHeader> "Advances (N)". Actions: [Status: Active|Closed|All] / [View Log] /
             [+ Add Advance] primary.
<DataTable>  Employee (with a "Terminated" tag where staff.status != 'active') |
             Count | Total Amount | Total Recovered | OUTSTANDING (bold) | kebab
Row menu: Debit Amount / Transaction Logs / Edit Installment  (Attendo's exact verb set)
  Debit Amount      -> sm Drawer: amount, date, comment. Posts a journal entry.
  Transaction Logs  -> md Drawer: that staff member's advance transaction history.
  Edit Installment  -> sm Drawer: change staff_loans.emi_amount, with a reason.
[+ Add Advance] -> md Drawer: Employee*, Loan/Advance Name*, Amount*, Type* (Advance | Loan),
  Monthly Installment* (helper text: "This will be added to the employee's total monthly
  installment"), Transaction Date*, Comment.
Installments are auto-recovered on each payroll run — getLoanEMIsForMonth() in
src/lib/payroll.ts already returns min(emi_amount, remaining_balance) for active loans and
computeSettlement already subtracts loanEmiTotal. The manager never types a recovery amount.
Advance outstanding is ledger-derived via the existing get_advances_outstanding /
get_staff_advances_from_journals RPCs — keep using them, do not add a balance column.

/settlements/arrears — "Arrears"
<PageHeader> "Arrears (N)". Actions: [Status] / [View Log] / [+ Add Arrears] /
             [Pay Arrears] primary.
<DataTable>  Employee | Arrears Created | Arrears Paid | OUTSTANDING (bold) | Status | kebab
Row menu: Pay / Write Off / Cancel
[+ Add Arrears] -> sm Drawer: Employee*, Arrears Amount*, Transaction Date*, Comment.
                   Positive = back-pay owed to the employee; negative = a recovery from them.
[Pay Arrears]   -> sm Drawer: Employee*, Outstanding Arrears (read-only), Arrears to Pay*,
                   Transaction Date*, Comment.

NEW — WRITE OFF. Add a 'written_off' value to salary_arrears.status (migration).
  The business case: salary is cleared around the 10th of the following month. If someone
  leaves abruptly mid-month, the days they worked are a liability on the books that the
  company will not actually pay. It must close visibly, not vanish.
  The "Write Off" row action opens a sm Drawer requiring a MANDATORY reason, and on confirm:
    - sets status = 'written_off', records written_off_at / written_off_by / reason
    - posts a REVERSING journal entry through src/lib/journal-entries.ts so the ledger stays
      balanced and Trial Balance still reconciles
    - writes an audit_log entry
  Written-off arrears must be excluded from arrearsTotal in gatherSettlementInputs — check
  that the existing query filters on status = 'pending' and add 'written_off' to the
  exclusions if it filters differently.

/settlements/log — "Transaction Log"  [NEW PAGE]
One immutable ledger behind both Advances and Arrears (Attendo's /loan-arrears-log).
<FilterBar> Outlet / Type (Loan | Advance | Arrears) / <DateRangeField> / Search.
<DataTable> Employee | Transaction Date | Type | Transaction | Amount | Installment | Comment
<ActionsMenu> Export Excel / Export PDF. Read-only, no row actions.

/settlements/payouts — "Advance Payouts"  (the old /payouts)
Advances only. In src/pages/Payouts.tsx:
  - REMOVE the `expense` branch from handleExecutePayout and narrow the item type union to
    'advance' | 'salary'.
  - REMOVE 'petty_cash' from PAYMENT_MODES and DELETE the block that inserts into
    petty_cash_transactions. That table is being dropped in Phase 8, and today choosing
    petty_cash for an ADVANCE payout writes to it — the app would crash after the drop.
  - Remove the get_petty_cash_balance() call site.
  - Rebuild the page on the Phase 1 primitives.
ADVANCE APPROVAL: the client wants advances approved by Admin ONLY. Narrow the
approvals.approve permission so only the Owner and Administrator templates hold it — remove
it from any other template that has it. The existing enforce_request_maker_checker trigger
already blocks self-approval; leave it alone.

Keep /ledger as-is; it moves into this nav group in Phase 2 but its page does not change.
```

---

## PHASE 7 — Employee record

```
PHASE 7 — fix how leaving dates are captured, and expose salary history per employee.

PROBLEM: staff.date_of_leaving and staff.separation_reason both exist, but nothing ever asks
for them. The trigger staff_sync_status() stamps date_of_leaving = CURRENT_DATE whenever
status flips to inactive / left / terminated. So an employee who actually left on the 10th,
recorded in the system on the 25th, gets a leaving date of the 25th.
That is not cosmetic: settlement-engine.ts uses date_of_leaving to compute effectiveDays and
pro-rate the final month. A wrong leaving date means a wrong final salary.

BUILD:
1. A status-change <Drawer> on the employee record and on the Employees list row menu.
   Changing status to inactive / left / terminated opens it and REQUIRES:
     - Date of Leaving  (date picker, defaults to today, MUST allow back-dating, must not
       be before date_of_joining, must not be in the future)
     - Separation Reason (mandatory — free text or a select, your call, but not optional)
     - A warning line when the chosen date falls inside a month that is already finalized:
       "This month is finalized. Their final salary was calculated using a different leaving
       date. De-finalize and re-run to correct it."
   On save, write both columns explicitly.
2. Adjust staff_sync_status() so it only defaults date_of_leaving when the column is NULL —
   it must never overwrite a date the user supplied. Check the current implementation; if it
   already guards with "if not already set", leave it and just make sure the UI writes the
   value BEFORE or WITH the status change, not after.
3. Reactivating a staff member clears date_of_leaving and separation_reason, with a confirm.

ALSO:
4. Add a "Salary" tab to the employee detail page (src/pages/StaffDetails.tsx) rendering that
   person's salary_history: Effective From | Effective To | Monthly Salary | Change | Reason
   | Changed By. Gated on salaries.view. Include a "Revise Salary" action opening the same
   drawer as Phase 4's Salary Increments screen.
5. Add <ColumnChooser> to the Employees list (src/pages/StaffList.tsx) — Attendo's "Edit
   Columns" pattern. Offer the columns the list can render and persist the choice per user.
6. Rebuild the Employees list header on <PageHeader> + <FilterBar>, and move its row buttons
   into a <RowMenu>.
```

---

## PHASE 8 — Deletions

> **Order matters.** Several of these are load-bearing in ways the page name does not
> suggest. Step 6 has an unanswered question — do not run it until Shifts is settled.

```
PHASE 8 — delete the modules the client does not want. ORDER MATTERS. Several of these are
load-bearing in ways the page name does not suggest. Do them in exactly this sequence.

1. PAYROLL GROUPS — safe, but only after Phase 3.
   staff.payroll_group_id is never read by the settlement maths (grep confirms
   settlement-engine.ts does not reference it; the engine pulls org-wide
   payroll_statutory_settings directly). The FK is ON DELETE SET NULL.
   Batch Settle currently lives inside this page — confirm Phase 3's Finalize works first.
   Delete: src/pages/PayrollGroups.tsx, the route, the payroll_groups table, and the
   staff.payroll_group_id column.

2. BULK SALARY UPDATE — only after Phase 4 ships Salary Increments.
   Delete src/components/salary/BulkSalaryDialog.tsx and its button + state in
   SalariesAdvances.tsx.
   DO NOT DELETE the bulk_update_salaries RPC. It is the only writer of salary_history, and
   Phase 4's "Revise Salary" drawer calls it. Deleting it would silently stop increment
   tracking and break the increment-due report.

3. PETTY CASH — remove the coupling first, then the page.
   petty_cash is a selectable PAYMENT MODE for any payout, not just petty-cash ones. Phase 6
   should already have removed it from PAYMENT_MODES in Payouts.tsx and deleted the
   petty_cash_transactions insert. Verify that, then:
   - Delete src/pages/PettyCash.tsx and its route.
   - Drop petty_cash_transactions and the get_petty_cash_balance() RPC.
   - DO NOT drop the 'petty_cash' value from the payment_mode Postgres enum. Removing an
     enum value requires recreating the type across salary_settlements and payment_requests.
     Leave it defined and unused.
   - Set accounts.is_active = false for code 1300 (Petty Cash). Do NOT delete the row —
     historical journal_lines may reference it.

4. EXPENSES — the widest coupling. Unpick before dropping.
   expense_approval and expense_payout journal entries live in the SAME
   journal_entries/journal_lines tables as salary_settlement, salary_payout, advance_paid
   and advance_adjustment. KEEP ALL HISTORICAL ROWS — they are flagged is_immutable and the
   Ledger and Trial Balance reports read the full table. Deleting them breaks debit=credit.
   Remove expense handling from, at minimum:
     src/components/dashboards/ApprovalsWidget.tsx
     src/components/dashboards/PayoutsWidget.tsx
     src/pages/Approvals.tsx            (narrow the type union)
     src/pages/Payouts.tsx              (already done in Phase 6 — verify)
     src/components/dashboards/OwnerDashboard.tsx, AdminDashboard.tsx,
       AccountantDashboard.tsx, StaffDashboard.tsx
     src/hooks/useDashboardStats.ts, src/hooks/useNotificationCounts.ts
     src/pages/AuditLog.tsx             (remove the 'expenses' filter option)
     src/pages/Reports.tsx              (remove the Expenses tab and ExpenseExplorer)
     src/components/reports/CategoryWiseExpenseReport.tsx, EventWiseExpenseReport.tsx,
       StaffExpenseReport.tsx
     src/components/settings/ClearTransactionDataCard.tsx
   Then delete: src/pages/Expenses.tsx, NewExpense.tsx,
   src/components/staff/QuickExpenseForm.tsx, their routes, and the expenses +
   custom_expense_categories tables. Remove the Expense Categories card from
   Settings -> Organisation.
   Set accounts.is_active = false for codes 5100-5700. Do NOT delete those rows.
   VERIFY AFTER: /reports -> Trial Balance still reports "Balanced".

5. HOLIDAYS — delete the pages, KEEP the tables.
   settlement-engine.ts reads holidays and holiday_assignments, and separately merges a
   second subsystem (holiday_template, holiday_template_days, employee_holiday_template) via
   mergeTemplateHolidays(). Holiday days are forced to paid.
   This org has no holidays, so an EMPTY holiday set is a harmless no-op in the engine.
   Delete: src/pages/Holidays.tsx, HolidayTemplates.tsx, HolidayAssign.tsx and their routes.
   Remove Holidays from nav (Phase 2 already did).
   DO NOT drop holidays, holiday_assignments, holiday_groups, holiday_template,
   holiday_template_days or employee_holiday_template. Dropping them means editing the
   settlement engine for zero benefit and non-zero payroll risk.

6. DUTY ROSTER — delete the PAGE ONLY. THIS IS THE DANGEROUS ONE.
   staff_roster is read by settlement-engine.ts (line ~330) to build the day breakdown that
   decides who is paid for which day, AND it is WRITTEN BY src/pages/BulkAttendance.tsx —
   marking a cell WO / FD / HD / LV / A upserts a staff_roster row. Bulk Attendance
   Adjustments is a module the client is keeping and relies on.
   If you drop staff_roster, rosterRow is undefined for every day, unscheduled_is_off
   (default true) takes over, every day becomes a paid off-day, and absences stop being
   deducted entirely — the exact bug Phase 0 exists to surface.
   Delete: src/pages/Roster.tsx and its route only. Also delete src/pages/Shifts.tsx and its
   route ONLY IF the client has confirmed shifts are dead — this is still an open question,
   so ASK BEFORE DOING THIS ONE.
   KEEP: the staff_roster table, src/lib/shift-roster-service.ts, src/lib/bulk-attendance.ts,
   and every read/write of staff_roster in BulkAttendance.tsx, settlement-engine.ts and
   src/hooks/useAttendanceReportData.ts.

AFTER ALL SIX: run the full test suite, load every remaining route, and confirm Trial Balance
still balances. Report anything you had to touch that this list did not anticipate.
```

---

## PHASE 9 — Outlet-scoped Manager role

```
PHASE 9 — add an outlet-scoped Manager role. This is the largest new capability in the
project and it touches RLS across the app. Do it last, against a stable schema.

THE REQUIREMENT (client's words): HR is company-wide. A manager belongs to one outlet. The
manager watches who is absent at that outlet, can mark a hardworking person present even
though they took leave, and receives that outlet's leave requests from the staff app. A
manager must only ever see the staff of the outlet they manage.

WHAT ALREADY EXISTS
- outlets table (Ballu, Mirosh, Reality, TD, Mobile, and others), and staff.outlet_id on
  every employee.
- staff.is_manager (boolean) and staff.reporting_manager_id (self-FK).
- A REAL, RLS-enforced manager leave-approval flow: is_leave_of_my_report(_staff_id)
  (SECURITY DEFINER) plus the policies "Managers view reports leave" and "Managers approve
  reports leave" in supabase/migrations/20260716280000_manager_leave_approval_rls.sql. It
  even blocks a manager approving another manager's leave, escalating to admin/owner.
- src/components/.../TeamLeaveApprovals.tsx — the manager's inbox on their dashboard.

WHAT DOES NOT EXIST
There is NO outlet scoping anywhere. Every CREATE POLICY on staff, attendance_sessions,
leave_records and salary_settlements was checked — roughly fifty policies — and not one
contains an outlet_id predicate. Today an Admin, HR or Accountant sees every outlet.
outlet_id is used only for data organisation (holiday targeting, attendance policies,
biometric device mapping), never for access control.

BUILD
1. SQL helper: current_user_outlet_id() — SECURITY DEFINER, STABLE, returns the outlet_id of
   the staff row whose user_id = auth.uid(). Returns NULL for users with no staff link.
2. New built-in rights template "Manager", role_key 'manager':
     dashboard.view, staff.view, attendance.view, attendance.create, attendance.edit,
     attendance.manage, leave.view, leave.approve
   NO salary permissions of any kind — not salaries.view, not payslips.download, not
   settlements.*. A manager must never see pay.
   Add 'manager' to the app_role enum, and seed the template alongside the existing
   built-ins.
3. RLS. Add outlet predicates for the manager role on:
     staff                 (direct: outlet_id = current_user_outlet_id())
     attendance_sessions   (join through staff.outlet_id — no direct column)
     attendance_breaks     (join through attendance_sessions -> staff)
     leave_records         (join through staff.outlet_id)
     staff_roster          (join through staff.outlet_id)
     leave_balances        (join through staff.outlet_id)
   These are ADDITIVE policies for the manager role. Do not weaken or rewrite the existing
   owner/admin/hr/self policies.
4. Client: make AuthContext outlet-aware — expose the current user's outlet_id and an
   isOutletScoped boolean. Then scope every query that currently fetches all staff
   unscoped: src/pages/StaffList.tsx, src/components/reports/AttendanceReports.tsx,
   src/pages/Reports.tsx, src/pages/BulkAttendance.tsx, and the dashboards. Server-side RLS
   is the real enforcement; the client scoping is so the UI does not render empty tables and
   misleading counts.
5. Leave routing: KEEP the hierarchy rule (is_leave_of_my_report) and LAYER outlet scope on
   top — a manager sees their outlet's requests and approves their outlet's leave. Do not
   replace a working mechanism. Where the two disagree (a direct report at another outlet),
   the outlet scope wins for visibility.
6. Marking a leave-taker present: this happens in Bulk Attendance Adjustments, scoped to the
   manager's outlet, using the existing attendance.manage permission. The
   log_bulk_attendance_adjustment() trigger already audits every override — verify it fires
   for manager-initiated changes and records the acting user.

TEST WITH REAL FIXTURES: create a manager at Reality and assert they cannot read a staff
row, an attendance session, a leave record or a settlement belonging to Ballu — by direct
Supabase query, not just through the UI.
```

---

## Appendix — why certain things are the way they are

Short notes for whoever picks this up later.

**Why the settlement formula must be unified first (Phase 3A).**
`settlement-engine.ts` is pure and unit-tested and drives the batch path.
`Settlements.tsx` carries a hand-synced ~250-line duplicate driving the per-staff path. The
engine's own header comment admits it. Two implementations of one payroll formula will
drift, and when they do, batch and single settle will pay different amounts for the same
person.

**Why the three overrides are deleted, not ported.**
"Desired Net Payable" reverse-solves `leave_deduction = monthlySalary − advanceAdj −
desiredNet` and back-calculates deduction days — ignoring PF, ESI, PT, discipline fines,
absent deduction, overtime and bonus. The recomputed net therefore drifts from the number
typed. Attendo has zero overrides on its grid; corrections happen upstream in Bulk
Attendance, where the wrong attendance actually is.

**Why Roster's page dies but its table lives.**
`staff_roster` is both an input to the pay calculation and the storage behind Bulk
Attendance Adjustments. Dropping it makes every day a paid off-day.

**Why expenses' journal rows are kept.**
`expense_approval` / `expense_payout` entries share `journal_entries` and `journal_lines`
with salary and advances. Deleting them breaks debit = credit and the Trial Balance report
that is being kept.

**Why Bulk Salary Update becomes "Revise Salary" instead of disappearing.**
It is the only caller of `bulk_update_salaries`, which is the only writer of
`salary_history`. Deleting it silently ends increment tracking and makes the requested
increment-due report impossible.

**Things this app does better than Attendo — keep them.**
Bulk Attendance Adjustments (punch pairs, anomaly tags, hours-against-target per cell,
versus Attendo's single letter). The double-entry ledger and Trial Balance. The permission
system. The report builder. The QR-verified payslip — dropped only because the client's
format does not include it.
