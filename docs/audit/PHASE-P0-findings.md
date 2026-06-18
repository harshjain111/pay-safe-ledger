# Phase P0 — Foundations & cross-cutting — Findings

Scope reviewed: `AuthContext.tsx`, `lib/permissions.ts` + `permissions_system.sql`
(`has_permission`/`get_my_permissions`), `lib/utils.ts` (`toAmount`),
`query-keys.ts`, `lib/toast.ts`, `ui/data-table.tsx`, `layout/filter-bar.tsx`,
`ui/status-badge.tsx`, `components/layout/AppLayout.tsx` (nav gating), `App.tsx`
(route guards). Static audit — no code changed. Baseline: tsc clean · 122 tests ·
build OK.

Counts: **0 Critical · 3 High · 5 Medium · 6 Low/Nit.**

---

## HIGH

**H1 — Permission *revoke* is silently ineffective on the client.**
`AuthContext.tsx:138` — `setPermissions(set.size > 0 ? set : fallbackPermsFor(roleStr))`.
The server `get_my_permissions()` correctly returns the effective set with
`revoked` removed (`permissions_system.sql:179-185`), and returns **empty** for a
user reduced to no permissions. The client treats an empty-but-successful result
the same as "RPC not deployed" and overrides it with the **legacy-role defaults**.
Effect: you cannot reduce a user below their role via templates on the client —
a staff/admin assigned an empty or fully-revoked template still sees their full
role UI. Diverges from the server (RLS via `has_permission` denies).
*Fix:* fall back **only** in the `catch` (undeployed). On a successful RPC use
`set` verbatim, even when empty.

**H2 — No per-route permission guard; every page loads for any authenticated user.**
`App.tsx:114-148` — `ProtectedLayout` checks only `user`. Direct navigation to
`/settlements`, `/ledger`, `/users`, `/payroll-groups`, `/arrears`, `/audit-log`,
`/reports`, `/payouts` etc. is not blocked at the route. Protection relies on
**each page self-gating**. The confidential pages (Settlements, SalariesAdvances,
Ledger, Payouts, PayrollGroups, AuditLog, UsersList) *do* contain self-gates
(signal-count check — to be confirmed line-level in P1/P2/P8), so there is no
*known* open exposure, but one un-gated page = a hole, and task #109
("permission route guards") is satisfied only at page level.
*Fix:* a small `<RequirePermission perm=…>` wrapper per protected route (at least
the confidential ones). *NEEDS-LIVE to fully confirm each page's gate.*

**H3 — Salary visibility has two divergent gates.**
`AuthContext.tsx:217` `canViewSalaries = isOwner` (hard, owner-only) vs
`can('salaries.view')` (template-grantable; used by the Report Builder salary
source, P9). An owner granting `salaries.view` via a rights template makes the
salary **report source** unlock for a non-owner while the salary **tab/pages**
stay hidden — inconsistent, and a latent confidentiality leak through the builder.
*Fix:* one source of truth — either gate salary everywhere on `can('salaries.view')`,
or drop `salaries.view` from the grantable catalog and keep `isOwner` only.

## MEDIUM

**M1 — Permission system is client-complete but server-partial.**
`permissions_system.sql` (header + §8): only `settings.payroll.edit` (and, in
later migrations, salary_arrears / login_reset / saved_reports manage) are
enforced via `has_permission`. Most tables still gate by `has_role`. So granular
template grants/revokes change the **client** `can()` but not most **server** RLS:
a grant shows UI the server denies (RLS error); a revoke hides UI the server still
allows. By design (incremental), but the divergence is real — converge per phase.

**M2 — Nav is role-based while features are permission-based.**
`AppLayout.tsx` `getNavSections(userRole, …)` keys off `userRole` with no `can()`
filter. Granting `ledger.view` to a staff user won't add the Ledger nav link (must
deep-link); revoking a perm won't remove its link. Align nav items with `can()`.

**M3 — Route loading timeout can bounce a valid slow session to /auth.**
`App.tsx:70-78` redirects to `/auth` after 7s of `isLoading`, but AuthContext's own
failsafe is 15s (`AuthContext.tsx:63-67`). On slow networks a still-restoring valid
session is kicked to login (then possibly redirected back) — flicker/loop. Align the
two timeouts or drop the route-level one.

**M4 — No React error boundary around the routes.**
`App.tsx` — a render throw in any page white-screens the whole app; the `ErrorState`
component is not wired as a boundary. Wrap `<AppRoutes/>`/Suspense in an error
boundary with a reload affordance.

**M5 — `accountingMode` is not persisted.**
`AuthContext.tsx:54` — resets to `false` on refresh, so an accountant silently
drops back to "personal" context after every reload (changes which nav/data they
see). Persist to localStorage.

## LOW / NIT

**L1 — `toAmount` silently zeroes formatted strings.** `utils.ts:16` —
`Number("1,234.50")`/`Number("₹500")` → NaN → fallback `0`. Safe for `<input
type=number>` and DB numerics, but any comma/symbol string becomes `0` with no
signal. Strip separators before parse, or assert callers never pass formatted text.

**L2 — Public signup may be reachable.** `AuthContext.signUp` exists; if Supabase
email signup is enabled and `Auth.tsx` surfaces it, anyone can self-register
(roleless → no access, but account is created). *NEEDS-LIVE:* confirm signup is
disabled server-side or removed from the UI.

**L3 — toast `warning`/`info` look identical to `success`.** `toast.ts` — shadcn
has only `default`/`destructive`, so non-error severities all render neutral (no
amber). Severity is lost; consider an amber variant.

**L4 — Mixed data-fetching strategy.** `query-keys.ts` defines only 4 key families;
most pages use ad-hoc `useState`+fetch, not React Query, so a mutation on one page
won't refresh another open page until manual reload. Low impact single-user; a
staleness foot-gun as concurrency grows.

**L5 — `StatusBadge` maps `info`→green.** `status-badge.tsx:85` — "approved (info)"
and "paid (success)" both render green (4-tone design); minor semantic collision.

**L6 — `toAmount` negative half-cent rounding.** `utils.ts:18` — the `EPSILON`
nudge is tuned for positives; negative `.005` cases (now possible via arrears) can
round a hair off. Negligible, noted for completeness.

---

## Reviewed, no functional findings
`utils.cn`, `query-keys` (structure), `toast` (structure), `FilterBar`,
`StatusBadge` tone map, `DataTable` (sort nulls-last, client paginate, density —
solid). Client `ROLE_PERMISSIONS` map **exactly matches** the seeded server
templates (admin/accountant/staff/ca cross-checked) — the *only* client/server
divergence is H1's empty-set masking.

## Lightly reviewed (presentational — deferred deep read if needed)
`EmptyState`, `ErrorState`, `ListSkeleton`, `PageHeader`.

## Recommended fix order (when approved in Wrap)
H1 (one-line, high impact) → H3 → M5 → M3 → M4 → H2 (wrapper) → the rest.
H2/M1/M2 are the "incremental permission migration" cluster — best fixed together
as a deliberate "finish the permission system" task rather than piecemeal.

---

## Resolution (applied)
- **H1 FIXED** — `AuthContext.tsx`: server permission set is now used verbatim
  (empty included); fallback only on RPC error.
- **M3 FIXED** — `App.tsx`: route loading timeout 7s → 20s (above the 15s auth
  failsafe).
- **M4 FIXED** — new `components/layout/ErrorBoundary.tsx` wraps the routes; a
  page crash now shows a reload card instead of a white screen.
- **M5 FIXED** — `AuthContext.tsx`: `accountingMode` persists to localStorage.
- **DEFERRED (need a decision / live verification):**
  - **H2** route guards — pages self-gate today; a blind route→permission map
    risks lockout. Do as a focused task with live verification.
  - **H3** salary double-gate — product decision: is salary owner-only forever,
    or grantable via a rights template? (Changes `canViewSalaries`.)
  - **M1/M2** finish the server-side permission migration + make nav `can()`-based.
  - L1–L6 polish.
Verified: tsc clean · 124 tests · build OK.
