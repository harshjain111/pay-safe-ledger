# Server-side permission convergence (audit P0-M1)

**Status:** client side DONE (P0-H1 revoke, P0-M2 nav, P0-H2 route guards, P0-H3
salary gate). Server RLS convergence is **execution-gated on the live DB** — see
"Why this is live-gated" — so this file is the plan + safe recipe, not a blind
migration.

## ⚠️ PREREQUISITE (found during this work): `get_my_permissions()` was clobbered

Migration `20260619090000_restore_get_my_permissions_keys.sql` fixes a live bug
that makes the ENTIRE permission system inert on the client. `permissions_system`
(20260614) defined `get_my_permissions() RETURNS SETOF text` (permission keys),
but the later Lovable schema-sync `20260618064914` redefined it `RETURNS JSONB`
(`{roles:[…]}`). Postgres can't change a function's return type via
`CREATE OR REPLACE`, so they raced; `types.ts` (regenerated from live) shows
`Returns: Json`, i.e. the **live DB has the JSONB version**. The client then does
`new Set(permRows)` on a JSONB object → throws → falls back to legacy-role
defaults, so template grants/revokes (and P0-H1, P0-M2, P0-H2) currently do
**nothing** at runtime. The fix `DROP`s + recreates the `SETOF text` body (safe:
nothing in SQL references it, and it's a no-op if live is already correct).
**This must land + be smoke-tested before any RLS convergence** — otherwise the
templates that `has_permission` reads aren't the ones the client shows.

## The goal

Most table RLS still gates by `has_role(...)`. Granular template grants/revokes
therefore change the client `can()` but **not** server RLS: a revoked user can
still mutate server-side (RLS allows), and a granted user gets RLS errors. We want
each management policy to gate on `has_permission(uid, '<perm>')` so the rights
templates are the single source of truth on both tiers.

## The safe pattern (already proven in 20260614150000 §8)

`has_permission` is **lockout-safe by design**: owners short-circuit to true; a
user with no explicit `user_permissions` row falls back to their legacy role's
built-in template; and §7 of that migration backfilled a row for every existing
user. So replacing `has_role('admin')` with `has_permission(uid, 'X')` keeps every
current user who legitimately had access **iff** `X` is in that role's built-in
template (see `ROLE_PERMISSIONS` in `src/lib/permissions.ts`).

```sql
-- Convergence unit (per policy). MUST drop the exact old policy by name, else the
-- old has_role policy lingers and (RLS being permissive/OR'd) the revoke still
-- has no effect.
DROP POLICY IF EXISTS "<exact old policy name>" ON public.<table>;
DROP POLICY IF EXISTS "Permission manage <table>" ON public.<table>;  -- idempotent
CREATE POLICY "Permission manage <table>" ON public.<table>
  FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), '<perm>'))
  WITH CHECK (public.has_permission(auth.uid(), '<perm>'));
```

## Why this is live-gated (do NOT blind-sweep)

1. **Current state isn't reconstructable from the repo alone.** 94 migrations
   define 282 policies, dropped/recreated/overridden across files. The *effective*
   policy + its exact name for a table is only reliable from a live
   `SELECT * FROM pg_policies WHERE schemaname='public'`. Dropping the wrong name
   leaves the old role policy in place → the revoke silently does nothing.
2. **Client role-flags diverge from templates — converging blind locks people
   out.** Concrete trap: `AuthContext.canAddStaff/​canEditStaff = owner|admin|
   accountant`, but the **accountant template has only `staff.view`** (no
   `staff.create`/`staff.edit`). Converging `staff` RLS to `has_permission('staff.
   create')` would lock accountants out of a thing they do today. Each such area
   needs a product decision *before* converging.

## Per-area mapping & readiness

`✅` = template membership matches who can do it today → safe to converge once the
live policy name is known. `⚠️` = a divergence to resolve first.

| Area / table(s) | Target permission | In templates (default) | Decision needed |
|---|---|---|---|
| `user_roles` (assign/change role) | `users.manage` | owner, admin | ✅ verify current policy is owner/admin-only |
| `rights_templates`, `user_permissions` | `users.manage` | owner, admin | ✅ **already converged** |
| `payroll_statutory_settings` | `settings.payroll.edit` | owner | ✅ **already converged** |
| `petty_cash_transactions` (write) | `pettycash.manage` | owner, admin | ✅ verify accountant has no write today |
| `shifts`, `shift_assignments`, `week_off`, roster | `roster.manage` | owner, admin | ✅ |
| `holidays`, `holiday_templates`, `employee_holiday_template` | `holidays.manage` | owner, admin | ✅ |
| `salary_settlements`, `payroll_groups`, `salary_arrears` | `settlements.run` | owner | ✅ stays owner-only by default |
| `audit_log` (read) | `audit.view` | owner, admin, ca | ✅ |
| leave approve transitions | `leave.approve` | owner, admin | ✅ |
| `staff` (create/edit) | `staff.create` / `staff.edit` | owner, admin | ⚠️ accountant can add/edit today but template lacks it — decide: add `staff.create`/`staff.edit` to the Accountant template, or keep staff RLS role-based |
| `attendance_sessions` / discipline (manage) | `attendance.manage` | owner, admin | ⚠️ confirm no accountant/CA write today before converging |
| `expenses` (approve/reimburse transitions) | `approvals.approve` / `payouts.execute` | owner, admin (+accountant for payout) | ⚠️ multi-policy table (staff insert-own + approver update + payer update) — converge per-policy, not table-wide |

(Reference: `ALL_PERMISSIONS` / `ROLE_PERMISSIONS` in `src/lib/permissions.ts`.)

## Recipe (per phase, against the live DB)

1. **Introspect** the live policies for the target table:
   `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='<t>';`
2. **Confirm** the set of roles the current policy admits == the set of roles whose
   built-in template holds the target permission (table above). If a role is
   admitted today but lacks the perm → resolve the ⚠️ first (amend the template or
   skip that area).
3. **Write** one migration with a convergence unit per policy (drop the exact old
   name, create the `has_permission` one), `USING` + `WITH CHECK`.
4. **Smoke-test after Publish**, per converged area:
   - owner: can still do it (short-circuit).
   - a default admin: can still do it (template has the perm).
   - a user whose template was customized to **revoke** the perm: now blocked
     server-side (the whole point) — verify the RLS error, not just a hidden button.
   - a self-service staff user: unchanged for their own rows.

Convergence should land **one area per migration** so a regression is isolated and
revertable, never a 282-policy sweep.

## Introspection SQL (run in the Supabase SQL editor, project `tvjcyntqgbipennzbxgt`)

After Publishing the `get_my_permissions` fix, confirm it took and gather the
ground truth needed to write the first real convergence migration:

```sql
-- 1. Confirm get_my_permissions now returns permission KEYS (text), not JSONB:
SELECT pg_get_function_result(oid) AS returns
FROM pg_proc WHERE proname = 'get_my_permissions';
-- expect: SETOF text

-- 2. Spot-check a non-owner with a customised template actually resolves it:
--    (run while logged in as that user, or impersonate via the dashboard)
SELECT * FROM public.get_my_permissions();

-- 3. Dump the CURRENT effective policies for the first convergence targets so the
--    migration drops the exact old names (petty cash / roster / holidays / etc.):
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('petty_cash_transactions','shifts','shift_assignments',
                    'week_off','holidays','holiday_templates','audit_log')
ORDER BY tablename, cmd, policyname;
```

Paste the section-3 output back and the first table convergence migration can be
written against the real policy names (not guessed from the migration history).

## Note on `user_roles` — do NOT converge

Role assignment is intentionally **owner-only** (`"Owners can manage all roles"`,
`has_role('owner')`). Converging it to `users.manage` (owner+admin) would let an
admin insert a `role='owner'` row and self-escalate. Leave it role-based.
