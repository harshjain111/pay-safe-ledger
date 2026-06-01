#!/usr/bin/env node
// One-off bootstrap: create the FIRST owner account.
//
// Why this exists: the in-app "Add User" screen and the `create-user` edge
// function are both owner-gated (only an existing owner can create users), so
// there is a chicken-and-egg problem for the very first owner. This script
// uses the Supabase SERVICE ROLE key to create that first owner directly,
// mirroring exactly what `supabase/functions/create-user/index.ts` does:
//   1. auth.admin.createUser({ email_confirm: true, user_metadata })
//   2. insert into public.user_roles { user_id, role: 'owner' }
//
// SECURITY: secrets are read from the environment and never written to disk.
//   - SUPABASE_SERVICE_ROLE_KEY  (required) Supabase service-role key
//   - OWNER_PASSWORD             (required) the owner's login password
// VITE_SUPABASE_URL is read from the project .env (it is not a secret).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
//   OWNER_PASSWORD='<owner-password>' \
//   node scripts/bootstrap-owner.mjs
//
// Optional overrides (sensible defaults below):
//   OWNER_NAME, OWNER_PHONE, PHONE_EMAIL_DOMAIN

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// --- tiny .env reader (no extra deps) -------------------------------------
function readEnvFile(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = readEnvFile(join(projectRoot, ".env"));

// --- config ----------------------------------------------------------------
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;

const OWNER_NAME = process.env.OWNER_NAME || "Ankit Madhoggaria";
const OWNER_PHONE = (process.env.OWNER_PHONE || "9830049851").replace(/\D/g, "");
const PHONE_EMAIL_DOMAIN =
  process.env.PHONE_EMAIL_DOMAIN ||
  process.env.VITE_PHONE_EMAIL_DOMAIN ||
  fileEnv.VITE_PHONE_EMAIL_DOMAIN ||
  "phone.payroll.internal";

const ROLE = "owner";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("VITE_SUPABASE_URL is not set (looked in env and .env).");
if (!SERVICE_ROLE_KEY)
  fail("SUPABASE_SERVICE_ROLE_KEY env var is required (never commit this key).");
if (!OWNER_PASSWORD)
  fail("OWNER_PASSWORD env var is required (the owner's login password).");

const pseudoEmail = `${OWNER_PHONE}@${PHONE_EMAIL_DOMAIN}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // paginate through users; the user base for a fresh project is tiny
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log("Bootstrapping first owner…");
  console.log(`  name : ${OWNER_NAME}`);
  console.log(`  phone: ${OWNER_PHONE}`);
  console.log(`  email: ${pseudoEmail}`);
  console.log(`  role : ${ROLE}`);
  console.log("");

  // 1. Create (or reuse) the auth user.
  let userId;
  const existing = await findUserByEmail(pseudoEmail);
  if (existing) {
    userId = existing.id;
    console.log(`• Auth user already exists (${userId}); reusing and resetting password.`);
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: OWNER_NAME,
        phone: OWNER_PHONE,
        email: "",
      },
    });
    if (updErr) fail(`Failed to update existing auth user: ${updErr.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: pseudoEmail,
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: OWNER_NAME,
        phone: OWNER_PHONE,
        email: "",
      },
    });
    if (error) fail(`Failed to create auth user: ${error.message}`);
    userId = data.user.id;
    console.log(`• Created auth user (${userId}).`);
  }

  // 2. Ensure the owner role row exists (idempotent).
  const { data: roleRow, error: roleSelErr } = await admin
    .from("user_roles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleSelErr) fail(`Failed to read user_roles: ${roleSelErr.message}`);

  if (!roleRow) {
    const { error: insErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: ROLE });
    if (insErr) fail(`Failed to insert owner role: ${insErr.message}`);
    console.log("• Inserted user_roles row with role 'owner'.");
  } else if (roleRow.role !== ROLE) {
    const { error: updErr } = await admin
      .from("user_roles")
      .update({ role: ROLE })
      .eq("id", roleRow.id);
    if (updErr) fail(`Failed to update role to owner: ${updErr.message}`);
    console.log(`• Updated existing role from '${roleRow.role}' to 'owner'.`);
  } else {
    console.log("• Owner role already present; nothing to change.");
  }

  console.log("\n✔ Done. You can now log in with:");
  console.log(`    phone   : ${OWNER_PHONE}`);
  console.log("    password: (the OWNER_PASSWORD you provided)\n");
}

main().catch((err) => fail(err?.message || String(err)));
