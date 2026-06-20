# Shifts & Roster module

Built by **extending** the app's existing shift/roster/scoring spine (not a
parallel system), so the audited settlement engine stays the single source of
truth for pay.

## Data model (migrations `20260618110000`, `20260618110100`)
- **`shifts`** (extended): `alias`, `color`, `description`, `is_one_time_all_days`,
  `has_break`, `is_open` (Open Shift = no fixed timing). The legacy
  `check_in_time`/`check_out_time` are kept populated for back-compat.
- **`shift_day_timing`** — per-weekday `start/end` + optional `break_start/end`
  (weekday 0=Sun..6=Sat). Existing shifts were backfilled one-time-all-days.
- **`hr_pay_rules`** (the §1.3 scorer, read by `computeDayBreakdown`): extended
  with `attendance_mode` and `is_shift_wise_work_hrs`; **`working_hour_config_history`**
  records each change effective from the next day.
- **`shift_assignment`** (`staff_id, weekday, shift_id`) — the recurring weekly
  default shift. **`week_off`** (`staff_id, weekday, state ∈ WORKING|WEEK_OFF|
  OCCASIONAL_WEEK_OFF`) — the recurring weekly off pattern.
- **`staff_roster`** (extended): `status ∈ SCHEDULED|OFF|AUTO_PRESENT`,
  `source ∈ TEMPLATE|MANUAL|AUTO_CHECKIN`. `is_off` is kept in sync with
  `status='OFF'` so the existing engine read is unchanged.

## §1.3 working-hour scoring (`lib/shift-roster.ts`, 18 tests)
`scoreDay(punches, config)` → `FULL | HALF | ABSENT`:
- `ALL_PUNCH` sums every in→out pair; `FIRST_LAST_ONLY` spans first-in→last-out.
- `DEFAULT_FULL` = any presence is full; `SINGLE_PUNCH_FULL` = a lone check-in is
  full, but real in/out pairs score by hours.
- worked ≥ `full_day_minutes` ⇒ FULL; ≥ `half_day_minutes` ⇒ HALF; else ABSENT.

Config changes **take effect the next day** (`nextEffectiveFrom`) and are kept in
`working_hour_config_history` (`configForDate` resolves the row effective on a
date). **Known follow-up:** the live `computeDayBreakdown` still reads the
`hr_pay_rules` singleton, so a saved change applies immediately *and* is recorded
in history; wiring the scorer to resolve config by date is the remaining
integration step.

## §7 custom roster rule (the intentional deviation)
The roster is **sparse**: it holds only the people scheduled to work.
- **Resolution** (`resolveWorking`): a `SCHEDULED`/`AUTO_PRESENT` row ⇒ working
  (shift may be null = Open Shift); a row with `status='OFF'` ⇒ off; **no row ⇒
  off by default** (not scheduled). The existing `hr_pay_rules.unscheduled_is_off`
  already gives "missing row ⇒ off", so this holds in the engine too.
- **Auto-promote on check-in** (`autoPromoteOnCheckIn`, wired into `checkIn()` in
  `lib/attendance.ts`, best-effort so it never blocks a punch): if the person is
  unrostered or `OFF`, upsert a row `status=AUTO_PRESENT, source=AUTO_CHECKIN`
  with `infer_shift` = their **Shift Assignment** for that weekday, falling back
  to **Open Shift** (null) — the configured choice.
- **Reversal** (`reverseAutoEntryIfNeeded`): if a day's punches are all gone,
  delete the roster row **only when `source='AUTO_CHECKIN'`**. Declared week-offs
  (`source=TEMPLATE/MANUAL`) are never auto-deleted.

### Decisions (as confirmed)
- **`infer_shift`** = weekday Shift Assignment → Open Shift fallback.
- **Pay treatment** of an unscheduled person who shows up = **normal working
  day** (the auto-promoted day scores like any present day via §1.3).
- **Reversal nuance:** promoting a *declared* OFF to `AUTO_PRESENT` overwrites its
  `source` to `AUTO_CHECKIN`; a later reversal therefore deletes the row (it
  reverts to "not scheduled" = off-by-default, losing the "planned off" tag for
  that one date). A `prior_status` column is the suggested future enhancement.

## Screens
- `/shifts` — Shifts CRUD (per-weekday timings, breaks, colour, Open Shift) +
  the **Set Working Hours** modal (§1.3 config).
- `/shift-assignment` — weekly grid (per-weekday shift dropdown), save.
- `/week-off` — tri-state grid (Working / WO / Occasional, click-to-cycle) +
  Bulk Update.
- `/roster` — date-range spreadsheet; each cell = a shift / Week Off / Open Shift
  dropdown, colour-coded, pre-filled from the weekly template overlaid with any
  saved overrides; per-date override + Excel export.

All four are owner/admin-gated; the new tables carry RLS mirroring the existing
shift/roster tables.
