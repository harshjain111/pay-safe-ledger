# RBAC plan — roles, View/Add/Edit/Delete permissions, per-user overrides

Goal: proper role-based access with a **View / Add / Edit / Delete** matrix per
module, sensible **role defaults**, and the ability to grant/revoke specific
permissions for **individual users**. This is also the foundation the multi-tenant
(org) RLS will build on, so we do it first.

## What already exists

- **Catalog** (`src/lib/permissions.ts` + `permissions` table) — the list of
  permission keys, grouped by module.
- **Role templates** (`rights_templates`) — a named permission set per legacy role
  (Owner = ALL). Editable in the Rights Templates screen.
- **Per-user overrides** (`user_permissions.granted[] / revoked[]`) — add or take
  away specific permissions for one person on top of their template.
- **Resolution** — `has_permission(uid, key)` (SQL) and `can(key)` (client), with
  owner short-circuit and a no-lockout fallback to the role's built-in template.

So "role-wise + special for specific users" is already modelled; the work is
(1) completing the V/A/E/D matrix and (2) actually enforcing it.

## Step 1 — Catalog + defaults (DONE, additive, no behaviour change)

- `permissions.ts` now exposes View/Add/Edit/Delete for the data modules (staff,
  attendance, leave, advances, expenses, petty cash) plus the special actions
  (approve, run settlements, manage, users). Migration
  `20260619100000_expand_permission_catalog_vaed.sql` seeds the new keys and
  appends them to the built-in templates (append-only).
- Effect: the Rights Templates screen now shows the full V/A/E/D matrix, settable
  per role and per user. Nothing is enforced on the new keys yet, so Konnect is
  unchanged.

## Step 2 — Enforcement: client (needs a per-role live smoke test)

The app currently gates most actions on **role flags** in `AuthContext`
(`canAddStaff = isOwner || isAdmin || isAccountant`, etc.). Switch these to
**permission checks** (`can('staff.create')`, …). Because the built-in templates
are seeded to match each role's current capabilities, default users see no change;
a revoke now actually hides/blocks the action. This changes access-control
behaviour, so after Publish it must be **smoke-tested as each role** (owner /
admin / accountant / staff / ca) before trusting it — that's why it isn't shipped
blind in Step 1.

## Step 3 — Enforcement: server RLS (do with the tenancy work, on staging)

UI gating is not security — the database must enforce it too. Today most RLS is
role-based (`has_role`). Converging it to `has_permission` is the P0-M1 work in
`docs/permission-server-convergence.md`, and it's **live-gated** (the effective
policies span 94 migrations + Lovable's managed layer; must be introspected on the
live DB). Since the multi-tenant rollout rewrites **every** RLS policy anyway (to
add `org_id` isolation), the permission-RLS and org-RLS convergence should be done
**together, on a fresh/staging database, with adversarial cross-tenant + per-role
leak tests** — not twice, and not blind on live payroll.

## Multi-tenant (org) — the next project

Chosen model: **shared database + `org_id` + RLS** (pooled SaaS). Non-negotiables
for "no possible leakage":
- `org_id NOT NULL` (FK → `organizations`) on every tenant table + backfill.
- A `current_org_id()` SECURITY DEFINER helper sourced from the authenticated
  user's server-side record (never a client value).
- RLS on **every** table: `org_id = current_org_id()` AND the permission check.
- Every SECURITY DEFINER function and every view scoped by org (they bypass RLS).
- Storage buckets partitioned by org.
- A test suite that tries to read/write across orgs and MUST fail, per role.

Build it on a fresh Supabase, prove isolation with those tests, then migrate
Konnect's data in under one org and Gloo as the second.
