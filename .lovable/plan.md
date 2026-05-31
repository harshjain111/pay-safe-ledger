
## 1. Rebrand from Smokzy → Konnect 2 Hospitality

**Logo** — copy the uploaded mark to `src/assets/logo.png` (and `public/logo.png` for PWA/favicon). Replace all word-mark spots that currently read "Smokzy" with the logo image + the wordmark "Konnect 2 Hospitality":
- `src/pages/Auth.tsx` (header + footer copyright)
- `src/pages/Index.tsx` (landing header)
- `src/components/layout/AppLayout.tsx` (sidebar brand)
- `src/components/pwa/InstallPrompt.tsx` (install copy)
- `src/lib/pdf-export.ts` (PDF header + footer)
- `src/index.css` (comment only)

**Metadata / PWA** — update `index.html` (title, theme meta, OG/Twitter tags, apple-mobile-web-app-title) and `vite.config.ts` PWA manifest (`name`, `short_name`, `description`). Title becomes `Konnect 2 Hospitality – Payroll & Operations`.

**Favicon & PWA icon** — generate new `pwa-icon-192.png` and `pwa-icon-512.png` from the logo and overwrite the files in `public/`. Replace `public/favicon.ico` with a logo-based `favicon.png` and update the `<link rel="icon">` accordingly.

## 2. Phone-auth pseudo-email migration

Switch the suffix from `@phone.smokzy.internal` → `@phone.konnect2hospitality.internal` in:
- `src/pages/Auth.tsx`
- `supabase/functions/create-user/index.ts`
- `supabase/functions/create-staff-user/index.ts`
- `supabase/functions/migrate-owner-to-phone/index.ts`

To avoid locking out existing users, run a one-shot DB migration that rewrites every `auth.users.email` ending in `@phone.smokzy.internal` to the new suffix (phone digits unchanged). Login flow continues to work transparently because the lookup is derived from the phone number.

## 3. PF & ESI in salary settlement (new module)

### Settings (new)
- **PF Settings** (Owner-only, global): toggle "PF enabled", employee rate %, employer rate %, contribution-base cap (₹), wage-base mode (Basic = Monthly Salary for this app), default enrollment on/off for new staff.
- **ESI Settings**: globally enabled toggle + default employer rate %; eligibility ceiling (₹). Employee rate % is **per-staff** (per your choice), set on the staff profile.

Stored in a new `payroll_statutory_settings` table (singleton row, Owner-managed).

### Per-staff enrollment (Staff profile, Owner-only fields)
- `pf_enrolled` (boolean)
- `pf_employee_rate_override` (nullable %, falls back to global)
- `esi_enrolled` (boolean)
- `esi_employee_rate` (% — required when enrolled, no global default)

### Settlement calculator changes (`src/pages/Settlements.tsx`)
Extend `SettlementCalculation` with:
- `pfEmployee`, `pfEmployer`, `esiEmployee`, `esiEmployer`

Formula additions (computed after pro-rata & leave, before advance adjust):
```
basicForPf  = min(proRataSalary, pfBaseCap)         // when pf_enrolled
pfEmployee  = round(basicForPf × pfEmployeeRate%)
pfEmployer  = round(basicForPf × pfEmployerRate%)

esiBase     = proRataSalary                          // gross
esiEligible = esi_enrolled && esiBase ≤ esiCeiling
esiEmployee = esiEligible ? round(esiBase × esi_employee_rate%) : 0
esiEmployer = esiEligible ? round(esiBase × esiEmployerRate%) : 0

grossSalary = max(0, proRataSalary − leaveDeduction − disciplineFine − pfEmployee − esiEmployee)
```
UI breakdown card adds two new line items (only when > 0): "PF (Employee X%)" and "ESI (Employee X%)", each with a tiny info popover explaining the base & rate used. Logic is fully automatic — Owner just sees the deductions appear.

### Persistence
Add columns to `salary_settlements`:
- `pf_employee`, `pf_employer`, `esi_employee`, `esi_employer` (numeric, default 0)
- `pf_rate_employee`, `pf_rate_employer`, `esi_rate_employee`, `esi_rate_employer` (snapshot %)
- `pf_base`, `esi_base` (numeric snapshot)

### Journal entries (`src/lib/journal-entries.ts`)
Add new account codes & seed via migration:
- `2100` EPF Payable (Liability)
- `2200` ESI Payable (Liability)
- `5050` Employer PF Contribution (Expense)
- `5060` Employer ESI Contribution (Expense)

Extend `createSalarySettlementEntry` so each settlement also posts (when amounts > 0):
- Dr Staff Payable / Cr EPF Payable — `pfEmployee`
- Dr Staff Payable / Cr ESI Payable — `esiEmployee`
- Dr Employer PF Expense / Cr EPF Payable — `pfEmployer`
- Dr Employer ESI Expense / Cr ESI Payable — `esiEmployer`

(Existing Salary Expense / Staff Payable lines remain unchanged, balanced by the trigger validator.)

### Confirm dialog & PDF
- `EnhancedSettlementConfirmDialog` shows PF/ESI lines in the breakdown.
- Settlement PDF (`pdf-export.ts`) shows the new rows under "Deductions".

## 4. Memory updates

Replace the "No tax logic" core rule scope: GST stays excluded, but statutory payroll (PF/ESI) is now an in-scope module. Update `mem://constraints/no-gst-or-tax-logic` and the `Auth` core line (new pseudo-email suffix). Add a new `mem://accounting/pf-esi-module` memory describing the settings, formulas, account codes, and journal posting.

## Technical notes

- All new tables/columns ship with explicit GRANTs to `authenticated` + `service_role` and Owner-only RLS (read by all authenticated, write by owner).
- Settlement is still immutable post-confirm — no behavioural change there.
- No new edge functions, no external integrations.
- Existing settled rows backfill with `0` for the new columns — historic settlements stay untouched.
- Pseudo-email migration runs once via SQL `UPDATE auth.users SET email = …` (no other schema touched). Phone numbers themselves are unchanged.

After you approve, I'll implement everything in build mode in one pass.
