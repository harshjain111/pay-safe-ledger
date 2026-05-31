## Goal
Turn the current single-figure salary settlement into a structured **Payroll** module covering Salary Structure, Deductions, Processing (monthly + bonus + overtime), and Payslips — matching the standard payroll checklist you listed. PF/ESI already exist; this plan adds the rest while keeping the immutable double-entry ledger intact.

## 1. Salary Structure (per staff, hybrid)
Fixed components live on the staff record; variable components are entered at settlement time.

**Fixed (staff profile, Owner-editable):**
- `basic_salary` (₹)
- `hra` (₹)
- `other_allowances` (₹)
- `monthly_salary` stays as the auto-derived sum (Basic + HRA + Allowances) — used everywhere salary is referenced today, so no breakage.

**Variable (entered per month on the settlement screen):**
- Incentives (₹)
- Bonus (₹)
- Overtime amount (₹) — auto-suggested from attendance, Owner can override

A new "Salary Structure" card on **Staff → Details** (Owner only, masked for others) lets Owner edit Basic/HRA/Allowances. Saving writes a `salary_history` row (already exists) so historical settlements stay accurate.

## 2. Deductions
Existing: **PF** (with employer contribution), **ESI** (with employer contribution), Leave deduction, Discipline fine, Advance adjustment.

New:
- **Professional Tax (PT)** — flat slab. New singleton settings row alongside PF/ESI:
  - `pt_enabled` (bool), `pt_monthly_amount` (₹, default 200), `pt_min_gross` (₹, exempt below this).
  - Per-staff opt-out via `pt_exempt` boolean on `staff`.
  - Note: This intentionally overrides the "no tax" memory — PT is a statutory payroll deduction, not income tax / GST. The no-GST/no-income-tax rule stays.
- **Loan Deductions** — new `staff_loans` table (principal, EMI, start month, remaining balance, status). On each settlement, active loans auto-add an EMI deduction line and decrement the balance. Owner can pause/close a loan.

## 3. Payroll Processing
- **Monthly Payroll** — existing Settlements screen, upgraded:
  - Earnings section: Basic, HRA, Allowances, Incentives, Bonus, Overtime (pro-rated for leave where applicable).
  - Deductions section: Leave, Discipline, PF (Ee), ESI (Ee), PT, Loan EMIs, Advance adjustment.
  - Employer contributions (PF Er, ESI Er) post as expense + liability (current behavior).
  - Net Payable = Earnings − Deductions.
- **Bonus Processing** — inline field on the monthly settlement (one-off bonus per month). No separate screen needed; bonus rows show on the payslip.
- **Overtime Calculation**:
  - Auto: `(worked_minutes − scheduled_minutes) / 60 × (basic ÷ working_days ÷ scheduled_hours) × 1.5` per day, summed for the month.
  - Manual override field on the settlement screen with reason capture.
  - Source: `attendance_sessions.worked_minutes` + `staff_shift_assignments`.

## 4. Payslips
- **Generate**: on settlement confirmation, an immutable PDF is rendered using the existing `pdf-export.ts` helper, structured as: Header (logo + Konnect 2 Hospitality + month) → Staff block → Earnings table → Deductions table → Net Payable → Signature line. Stored on the `salary_settlements` row (no file storage needed — generated on-demand from the snapshot columns).
- **Staff download** (in-app): button on Staff Dashboard / My Settlements list for each settled month. Re-renders the PDF from the stored snapshot.
- **Owner bulk download**: on Settlements page, a "Download All Payslips" action for the selected month produces a ZIP of all confirmed payslips (client-side with `jszip`).
- Email payslip is **not** in scope per your selection.

## 5. Permissions & Privacy
- All new amounts (Basic/HRA/Allowances/PT/Loans) follow the existing salary-mask rule: visible only to Owner; Admin/Accountant/CA see masked (***) values. Staff sees their own.
- Only Owner can edit structure, PT settings, and create loans.

## 6. Accounting (double-entry)
New account codes:
- `5070` Bonus Expense
- `5080` Overtime Expense
- `2300` Professional Tax Payable
- `1250` Staff Loans (Asset / Receivable)

Per settlement, journal lines (extending today's flow):
```
Dr  Salary Expense (Basic+HRA+Allowances pro-rated)
Dr  Bonus Expense
Dr  Overtime Expense
Dr  PF Employer Expense        Cr  PF Payable (Er)
Dr  ESI Employer Expense       Cr  ESI Payable (Er)
                                Cr  PF Payable (Ee withheld)
                                Cr  ESI Payable (Ee withheld)
                                Cr  Professional Tax Payable
                                Cr  Staff Advances (advance adjustment)
                                Cr  Staff Loans (EMI adjustment)
                                Cr  Staff Payable (Net)
```
Balance is enforced by the existing `validate_journal_entry_balanced` trigger.

## 7. Technical Details
**DB migrations (one batch):**
- `staff`: add `basic_salary`, `hra`, `other_allowances`, `pt_exempt`.
- `payroll_statutory_settings`: add `pt_enabled`, `pt_monthly_amount`, `pt_min_gross`.
- `salary_settlements`: add `incentives`, `bonus`, `overtime_amount`, `overtime_auto`, `overtime_override_reason`, `pt_amount`, `loan_emi_total`, `earnings_basic`, `earnings_hra`, `earnings_allowances` (snapshots for payslip integrity).
- New table `staff_loans` (id, staff_id, principal, emi_amount, start_month, remaining_balance, status, notes, created_by, timestamps) with Owner-only RLS + service_role GRANT.
- New table `salary_settlement_loan_deductions` (settlement_id, loan_id, amount) so each settlement records which loans were debited.
- New accounts seeded: 5070, 5080, 2300, 1250.

**Code:**
- `src/lib/journal-entries.ts` — extend `createSalarySettlementEntry` for new lines.
- `src/lib/payroll.ts` (new) — pure calculation: structure breakdown, OT auto-calc, loan EMI fetch, PT eligibility.
- `src/pages/Settlements.tsx` — Earnings/Deductions sections + OT override + bonus/incentive fields + payslip download.
- `src/pages/StaffDetails.tsx` — Salary Structure card (Owner only).
- `src/pages/Settings.tsx` — PT settings section (next to PF/ESI).
- New `src/pages/StaffLoans.tsx` (Owner only) — create/list/close loans, route `/loans`.
- `src/lib/pdf-export.ts` — `generatePayslipPDF(settlement)` helper.
- `src/pages/Dashboard.tsx` (Staff view) — "My Payslips" list with download.
- `bun add jszip` for bulk download.

**Memory updates after build:**
- Update `mem://constraints/no-gst-or-tax-logic` to clarify PT is allowed; GST/Income Tax still excluded.
- New `mem://features/payroll-module` describing structure, deductions, OT, payslip flow.

## Out of scope (call-outs)
- Email payslip — skipped per your choice (no email infra needed).
- Per-state PT slabs — using flat amount.
- Annual Form 16 / TDS — explicitly excluded.