# Leaves & Holidays module

Built by **extending** the existing leave/holiday subsystem (not a parallel one),
so the settlement engine stays the single source of truth for pay.

## Data model (migrations `20260618100000`–`20260618100200`)
- **`leave_types`** (extended): `no_of_auto_allocation_leaves`,
  `auto_allocation_period`, `carry_forward_leaves` (cap), `carry_forward_period`,
  `encashment_enabled`, `encashment_limit`, `encashment_period`. Backfilled from
  the legacy `accrual`/`default_quota`/`carry_forward`. `is_paid`/`default_deduction`
  are retained — the engine still docks pay from approved `leave_records`.
- **`employee_leave_balance`** (`staff_id, leave_type_id, balance`) — the assign
  link + stored entitlement balance the jobs maintain.
- **`leave_balance_adjustment`** — mandatory-remarks audit trail of overwrites.
- **`leave_encashment`** — the "payable record": units to pay per period
  (idempotent per `staff/type/period`); payroll converts units→money.
- **`holiday_template`** + **`holiday_template_days`** (multi-day) +
  **`employee_holiday_template`** (one per staff).

## Pure logic (`lib/leave-allocation.ts`, 19 tests)
- `applyAutoAllocation` / `allocatesOn` — credit qty; MONTH fires monthly + year-end,
  YEAR only on the year boundary.
- `applyPeriodEnd` — **two-threshold** model: `carried = min(balance,
  carry_forward_leaves)`; the remainder above `encashment_limit` is **encashed**
  (when enabled), the rest **forfeited**.
- guards (`validateEmployeeSelection`, `validateHolidayTemplateExists`,
  `validateBalanceAdjustment`, `validateLeaveTypeForm`) with the exact UI messages.
- `planAssignments` (idempotent), `expandHolidayDays`, `mergeTemplateHolidays`.

## Cron jobs (`supabase/functions/leave-jobs`)
The edge function mirrors the tested pure logic and runs with the service role:
- `{ action: 'allocate', period }` — credits `no_of_auto_allocation_leaves` to
  every holder of a type whose `auto_allocation_period` matches.
- `{ action: 'carry_forward', period }` — caps carried balance, writes a pending
  `leave_encashment` for the encashed excess, forfeits the rest.

**Schedule** (run once, after deploy; needs `pg_cron` + `pg_net`, and a
`CRON_SECRET` function env if you want the shared-secret guard):
```sql
-- 1st of each month 00:30 UTC — monthly allocation then carry-forward
select cron.schedule('leave-allocate-month','30 0 1 * *', $$
  select net.http_post('https://<project-ref>.functions.supabase.co/leave-jobs',
    '{"action":"allocate","period":"MONTH"}'::jsonb,
    headers:='{"Content-Type":"application/json","x-cron-secret":"<secret>"}'::jsonb); $$);
select cron.schedule('leave-carry-month','35 0 1 * *', $$
  select net.http_post('https://<project-ref>.functions.supabase.co/leave-jobs',
    '{"action":"carry_forward","period":"MONTH"}'::jsonb,
    headers:='{"Content-Type":"application/json","x-cron-secret":"<secret>"}'::jsonb); $$);
-- 1 Jan 00:40 UTC — yearly allocation + carry-forward (same with "period":"YEAR")
```

## Engine wiring
`gatherSettlementInputs` folds an employee's **assigned holiday-template** dates
into the paid-day set via `mergeTemplateHolidays` (best-effort; never blocks a
settlement), so template holidays score as paid days exactly like the existing
scoped `holidays`.

## Defaults / decisions
- `employee_id` → **`staff_id`**; spec `alias` → existing **`leave_types.code`**.
- An encashed **unit → money** conversion (units × daily rate) is a payroll hook;
  `leave_encashment` stores units, settlement converts.
- Two balance representations coexist: the legacy year-scoped `leave_balances`
  (live-computed view) and the new stored `employee_leave_balance` (jobs/screens).
- **Follow-up:** the cron `cron.schedule` entries above must be installed on the
  live DB (kept out of a migration to avoid committing the project ref + secret).

## Screens
`/leave-types` (CRUD + conditional encashment) · `/leave-assign` (idempotent bulk)
· `/leave-balance` (bulk adjust + audit; spreadsheet + Excel) · `/holiday-templates`
(multi-day builder) · `/holiday-assign` (guarded; one per employee).
