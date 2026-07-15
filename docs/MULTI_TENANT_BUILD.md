# Multi-tenant (SaaS) build plan — shared DB + org_id + RLS

Turn the single-company app into a pooled multi-tenant SaaS where every company's
data is isolated by database rules, with **no possible cross-company leakage**.

**Build this on a FRESH/STAGING Supabase project, prove isolation with the leak
tests in Phase 6, and only then migrate real data.** Do NOT retrofit this blind on
the live Konnect DB — its effective policies span 94 migrations + Lovable's managed
layer, and one missed rule leaks salaries between companies.

## The isolation invariants (non-negotiable)

1. Every tenant table has `org_id uuid NOT NULL` (FK → `organizations`).
2. Reads/writes are gated by `org_id = current_org_id()` in RLS on **every** table.
3. `current_org_id()` is derived from the authenticated user's **server-side**
   record — never a client-supplied value.
4. Every `SECURITY DEFINER` function filters by org (they bypass RLS).
5. Every view is `security_invoker = on` (or org-filtered) — views bypass RLS.
6. Storage objects are partitioned by org and checked in storage policies.
7. Default-deny: RLS enabled everywhere, zero `USING (true)` on tenant tables.
8. Writes also check `has_permission` (the RBAC layer) — org AND permission.

## Phase 0 — Staging

- New Supabase project (staging). Apply the full current schema to it.
- Point a staging build of the app at it. This is the sandbox for everything below.

## Phase 1 — Org model + current_org_id()

```sql
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One org per user (extend to many-orgs later if needed).
ALTER TABLE public.profiles ADD COLUMN org_id uuid REFERENCES public.organizations(id);
-- (or a user_organizations join table if a user may belong to several orgs)

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
```

The RBAC tables (`user_roles`, `user_permissions`, `rights_templates`) also get
`org_id`; `has_permission` / `get_my_permissions` resolve within the caller's org.

## Phase 2 — Stamp every tenant table

Enumerate the tenant tables (everything except global catalogs like `permissions`):

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;   -- review; exclude the permission catalog + organizations
```

For each: add `org_id`, default it from the caller, backfill, then enforce NOT NULL.

```sql
ALTER TABLE public.<t> ADD COLUMN org_id uuid
  REFERENCES public.organizations(id) DEFAULT public.current_org_id();
UPDATE public.<t> SET org_id = '<konnect-org-id>' WHERE org_id IS NULL; -- backfill
ALTER TABLE public.<t> ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX ON public.<t> (org_id);
```

The `DEFAULT current_org_id()` means inserts auto-stamp the caller's org, so app
code rarely has to pass org_id.

## Phase 3 — RLS rewrite (org + permission), one table group at a time

Replace the role-based policies with the pattern below. Do it per module (staff,
finance, payroll, attendance, …) and run the Phase-6 tests after each group.

```sql
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS <old policy names> ON public.<t>;   -- from live pg_policies

CREATE POLICY "org read" ON public.<t> FOR SELECT TO authenticated
  USING (org_id = public.current_org_id()
         AND public.has_permission(auth.uid(), '<module>.view'));

CREATE POLICY "org insert" ON public.<t> FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id()
              AND public.has_permission(auth.uid(), '<module>.create'));

CREATE POLICY "org update" ON public.<t> FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()
         AND public.has_permission(auth.uid(), '<module>.edit'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org delete" ON public.<t> FOR DELETE TO authenticated
  USING (org_id = public.current_org_id()
         AND public.has_permission(auth.uid(), '<module>.delete'));
```

Self-service rows (a staff member's own record) add `OR user_id = auth.uid()` to the
SELECT, still inside the org filter. This is where the RBAC V/A/E/D keys from
`docs/RBAC_PLAN.md` finally get enforced.

## Phase 4 — Close the RLS bypasses

- **SECURITY DEFINER functions** (`notify_users_by_role`, `get_my_permissions`,
  settlement/journal helpers, edge-function service-role writes): add an explicit
  `WHERE org_id = current_org_id()` (or org param) so they can't cross orgs.
- **Views** (`staff_public`, any reporting view): `ALTER VIEW ... SET (security_invoker = on)`
  so they run with the caller's RLS, or add an org filter.
- **Edge functions** using the service role (e.g. `ingest-punches`): they bypass
  RLS, so they must resolve and set org_id from the device's registered org.

## Phase 5 — App changes

- On login, load the user's org and its branding **from the org row** (in pooled
  mode, branding comes from `organizations`, not the per-deployment env used for
  the DB-per-org approach).
- Onboarding/signup: creating an org provisions the org row + its first owner +
  seeds that org's built-in rights_templates.
- (Optional) a platform-super-admin that can switch orgs for support — bypasses org
  RLS, so gate it with extreme care and audit every access.

## Phase 6 — Leak-test suite (must pass before real data)

Seed 2 orgs (A, B) + users per role in each, then assert:
- User in A `SELECT`s each table → only A rows; never a B row.
- User in A `INSERT` with `org_id = B` → rejected (WITH CHECK).
- User in A `UPDATE`/`DELETE` a B row by id → 0 rows affected.
- Every SECURITY DEFINER function called as A touches only A.
- Every view returns only A for user A.
- Storage: user A requesting a B object path → denied.
- A user lacking `<module>.edit` → write denied even within their own org.
- Report/joins never surface a B row to A.

Automate these (pgTAP or a scripted integration test) and run in CI.

## Phase 7 — Migrate + cut over

1. Create org **Konnect**; backfill all existing rows + users to it (Phase 2).
2. Create org **Gloo**; create Gloo's first owner (they set their own password).
3. Re-run the leak tests against the migrated data.
4. Point production at the multi-tenant DB.

## Rollback

Each module's RLS lands in its own migration, so a regression reverts to the prior
policy for just that table group — never a 282-policy big-bang.
