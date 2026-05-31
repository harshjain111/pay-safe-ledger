## Goal

Make attendance behave as **shift sessions** (anchored to the check-in date, not the calendar day), so night shifts that cross midnight work correctly. Stop falsely marking next-day "absent" when a shift covered it. Add a 10-hour WhatsApp checkout reminder and a 16-hour auto-close safety net.

---

## Part 1 — Session-based attendance (data + UI)

Good news: the data model already anchors a session to the check-in date (`work_date = localDateString()` at check-in) and worked minutes are already `checkout - checkin - breaks`. So the data layer is correct — this is mostly a **UI display fix**.

Changes:
- In all attendance list/table views (`MyAttendanceLogs.tsx`, `StaffAttendanceSection.tsx`, `SessionDetailsDrawer.tsx`, `PenaltiesPanel.tsx` where relevant):
  - Show check-in as `4:00 PM, 19 May`
  - Show check-out as `2:00 AM, 20 May` whenever the calendar date of check-out differs from `work_date`
  - Continue showing `worked_minutes` formatted via `formatMinutes` ("10h 0m")
  - Status badge unchanged (present/late/half-day/absent)
- No DB schema change required for Part 1.

## Part 2 — Session-aware absent detection

Update `supabase/functions/check-absent-staff/index.ts` so a staff member is **not** marked absent today if any of the following is true:
1. They have an approved leave for today.
2. They have an `attendance_sessions` row with `work_date = today` (already handled).
3. They have an **open** session (status `active`/`on_break`) whose `check_in_at` is in the last 24h (covers night shift still in progress).
4. They have a session with `work_date = yesterday` whose `check_out_at` is on or after today's IST midnight (yesterday's shift extended into today and covered the morning).
5. They have no shift assignment at all (can't determine "scheduled" → skip silently, as today).

Club staff are already excluded via `attendance_tracked = false`.

The cron job created earlier stays as-is (23:59 IST).

## Part 3 — 10-hour checkout reminder

**Schema (migration):**
- Add column `overtime_reminder_sent boolean not null default false` to `attendance_sessions`.

**Edge Function `check-overtime-reminder` (new):**
- Query `attendance_sessions` where `status in ('active','on_break')`, `check_out_at is null`, `overtime_reminder_sent = false`, and `check_in_at <= now() - 10h`.
- Join staff to get `full_name`, `phone`. Skip rows with no phone.
- For each, invoke `send-attendance-whatsapp` with `slab: 'checkout_reminder'`, `event_type: 'checkout_reminder'`, `deduction_amount: 0`, `actual_time: now ISO`, `scheduled_time: now ISO` (unused by template).
- On WhatsApp success, set `overtime_reminder_sent = true` for that session (idempotent so re-runs don't spam).

**`send-attendance-whatsapp` update:**
- Extend `Slab` union and `event_type` union with `'checkout_reminder'`.
- New branch builds payload **with no `components` array** — template `attendance_checkout_reminder`, language en/deterministic, no parameters. Exactly the JSON the user specified.

**Cron (via supabase--insert, not migration):**
- Enable `pg_cron` + `pg_net` if not already.
- Schedule `check-overtime-reminder` to run every 30 minutes, calling the function URL with `Authorization: Bearer <service role key>` and `apikey` headers.

## Part 4 — Auto-close stale sessions (16h)

Extend the same `check-overtime-reminder` function (single cron, two responsibilities) **or** add a sibling block in `check-absent-staff`. Plan: keep it inside `check-overtime-reminder` so it runs every 30 min.

- Find open sessions where `check_in_at <= now() - 16h`.
- Look up the staff's scheduled shift duration from `staff_shift_assignments` + `shifts` (in/out time, accounting for cross-midnight where out ≤ in → +24h). Fallback: 10h if no assignment.
- Set `check_out_at = check_in_at + shift_duration`, compute `worked_minutes = (check_out_at - check_in_at) - total_break_minutes`, `status = 'completed'`, and a new flag `auto_closed = true`.

**Schema (same migration):**
- Add column `auto_closed boolean not null default false` to `attendance_sessions`.
- Display a small "Auto-closed" badge in the session detail drawer and admin list (UI tweak).

We will NOT trigger discipline/WhatsApp checkout messages on auto-close (avoid spurious penalties); just close the row so absent detection isn't confused going forward.

## Testing scenario

1. Tester checks in at 16:00 IST today.
2. Run `check-absent-staff` manually tomorrow → tester is **not** marked absent (open session from yesterday covers it).
3. At 02:30 IST (10.5h after check-in), cron fires `check-overtime-reminder` → WhatsApp `attendance_checkout_reminder` sent, `overtime_reminder_sent = true`. Next run at 03:00 does **not** resend.
4. If tester still hasn't checked out by 08:00 IST (16h), auto-close sets `check_out_at = check_in_at + 10h`, `auto_closed = true`.

## Technical summary

- **Migration**: add `overtime_reminder_sent boolean default false`, `auto_closed boolean default false` to `attendance_sessions`.
- **Edge Functions**: edit `send-attendance-whatsapp` (new slab branch with no parameters), edit `check-absent-staff` (open/yesterday-session exclusion), create `check-overtime-reminder` (reminder + auto-close).
- **Cron**: insert a `cron.schedule('check-overtime-reminder', '*/30 * * * *', ...)` via the insert tool (contains project URL + service key).
- **UI**: cross-midnight date display in attendance views, "Auto-closed" badge.
- **No client business-logic changes** — `src/lib/attendance.ts` already anchors `work_date` to check-in date and computes worked time correctly across midnight.
