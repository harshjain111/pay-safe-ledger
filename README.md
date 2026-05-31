# Payroll & Accounting System

An internal web app for running staff payroll end to end: paying salaries and advances,
tracking expenses and reimbursements, recording attendance and leave, and keeping the
books with a built-in **double-entry ledger**. Users sign in with their phone number,
and what they can see and do is governed by their role (owner, admin, accountant, staff,
or CA). It ships as an installable PWA.

## Features

- **Staff & users** — manage staff records, employee details, salary history, and
  role-based user accounts (owner / admin / accountant / staff / CA).
- **Salaries & settlements** — monthly salary settlements with statutory PF/ESI
  handling, advances, and downloadable payslips (PDF).
- **Expenses & advances** — submit, approve, and reimburse expenses; request and
  approve advances; execute payouts.
- **Petty cash** — track petty-cash floats and spending.
- **Attendance, shifts & leave** — daily attendance, shift assignment, and leave
  requests/approvals with payroll deductions.
- **Double-entry ledger** — chart of accounts and journal entries keep every
  transaction balanced; per-staff and account ledgers.
- **Reports** — salary register, ledger, payments, expenses, and advance reports,
  exportable to PDF and Excel.
- **Audit log & notifications** — an immutable activity trail plus in-app
  notifications for requests, approvals, and payouts.

## Tech stack

| Area | Choice |
|------|--------|
| Build tooling | [Vite](https://vitejs.dev/) 5 (SWC), [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) |
| Language / UI | [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 3 + [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) |
| Routing | [React Router](https://reactrouter.com/) 6 |
| Server state | [TanStack Query](https://tanstack.com/query) 5 |
| Forms & validation | [react-hook-form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Charts | [Recharts](https://recharts.org/) |
| Exports | [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable, [SheetJS (xlsx)](https://sheetjs.com/) |
| Backend | [Supabase](https://supabase.com/) — Postgres + Row Level Security, Auth, Edge Functions |
| Testing | [Vitest](https://vitest.dev/) + Testing Library |

### Project structure

```
src/
  components/      UI: layout, shared widgets, shadcn/ui primitives
  pages/           Route-level screens (dashboard, list pages, forms)
  hooks/           React Query hooks and shared logic
  lib/             Domain logic (payroll, journal entries, PDF/Excel export, auth email)
  integrations/    Supabase client and generated types
  contexts/        Auth context
supabase/
  functions/       Deno edge functions (user creation, admin tasks)
  migrations/      SQL schema & data migrations
```

## Prerequisites

- **Node.js** 18+ (use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to install/manage versions)
- **npm** (see "Package manager" below)
- A **Supabase** project (for the database, auth, and edge functions)

## Local setup

```sh
# 1. Clone the repository.
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Install dependencies.
npm install

# 3. Set up environment variables (see "Environment variables" below).
cp .env.example .env
#    …then edit .env with your Supabase project values.

# 4. Start the dev server (http://localhost:8080).
npm run dev
```

> **Package manager:** This project uses **npm** as its canonical package manager. The
> committed lockfile is `package-lock.json`. Please do not introduce other lockfiles
> (e.g. `bun.lockb`, `yarn.lock`, `pnpm-lock.yaml`) — install dependencies with `npm install`.

## Environment variables

Configuration is read from environment variables at build time. Copy the template and
fill in the values from your own Supabase project (Project Settings > API and General):

```sh
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_PROJECT_ID` | yes | Your project reference ID (the subdomain of your project URL). |
| `VITE_SUPABASE_URL` | yes | Your project API URL, `https://<project-id>.supabase.co`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable (anon) key. Safe to ship to the client; access is enforced by RLS. |
| `VITE_PHONE_EMAIL_DOMAIN` | no | Domain used to synthesize login emails from phone numbers. Defaults to `phone.payroll.internal`. See note below. |

`.env` is gitignored and must never be committed. Use `.env.example` as the shared template instead.

> **Phone-login email domain.** Users sign in by phone number, but Supabase auth requires
> an email, so the app stores each user as `<digits>@<VITE_PHONE_EMAIL_DOMAIN>`. If you
> override the default, the same value must be set as the `PHONE_EMAIL_DOMAIN` secret on
> the Supabase edge functions **and** applied to existing `auth.users` rows via a
> migration — otherwise existing users can no longer sign in. See
> `supabase/migrations/*_neutralize_phone_email_domain.sql` for the pattern.

## Backend (Supabase)

The database schema and seed/data changes live in `supabase/migrations/` and are applied
in filename (timestamp) order. Server-side admin operations — such as creating users and
staff accounts — run as Deno **edge functions** in `supabase/functions/`. Edge functions
read their configuration (service-role key, `PHONE_EMAIL_DOMAIN`, etc.) from Supabase
function secrets, not from the frontend `.env`.

## Available scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the Vite dev server on port 8080. |
| `npm run build` | Production build to `dist/`. |
| `npm run build:dev` | Build using development mode/sourcemaps. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | Run ESLint over the project. |
| `npm test` | Run the Vitest test suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |

## Deployment

The frontend is a static Vite build (`npm run build` → `dist/`) and can be hosted on any
static host (Netlify, Vercel, Cloudflare Pages, S3/CloudFront, etc.). Make sure the
`VITE_*` environment variables are configured in the host's build settings, and that the
Supabase project (database, auth, edge functions) the build points at is deployed and
reachable.

This project was bootstrapped with [Lovable](https://lovable.dev/); you can also publish
it directly from the Lovable editor via **Share → Publish**, and connect a custom domain
under **Project > Settings > Domains**.
