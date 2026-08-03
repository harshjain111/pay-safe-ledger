// ============================================================================
// pull-etimetracklite — scheduled connector (login + report pull + ingest).
//
// Logs into the eTimeTrackLite (eSSL) console, pulls the last ~2 days of punches
// as CSV, resolves staff, derives in/out by per-day alternation, and feeds them
// to ingest-punches (dedup + normalize untouched). Cron-driven; CRON_SECRET-guarded.
//
// Modes (POST body): {"discover":true} dumps the report form; {"debug":true}
// runs the pull but returns diagnostics without ingesting; {} = normal pull.
// Secrets: ETIMETRACK_BASE_URL/USER/PASS, ETIMETRACK_DEVICE_KEY, CRON_SECRET.
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

/** Replicates the login page's Encrypt(): AES-128-ECB(password, key=UTF8(txtKey)) -> base64. */
function encPassword(plain: string, txtKey: string): string {
  const key = CryptoJS.enc.Utf8.parse(txtKey);
  return CryptoJS.AES.encrypt(plain, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString();
}

const BASE = (Deno.env.get("ETIMETRACK_BASE_URL") ?? "").replace(/\/+$/, "");
const USER = Deno.env.get("ETIMETRACK_USER") ?? "";
const PASS = Deno.env.get("ETIMETRACK_PASS") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEVICE_KEY = Deno.env.get("ETIMETRACK_DEVICE_KEY") ?? "";

const LOGIN_PATH = "/iclock/Default.aspx";
const HOME_PATH = "/iclock/Main.aspx";
const REPORT_PATH = "/iclock/Manage/DeviceLogList.aspx";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Jar {
  private c = new Map<string, string>();
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
  names() { return [...this.c.keys()]; }
  value(k: string) { return this.c.get(k); }
  absorb(res: Response) {
    // Prefer getSetCookie() (proper multi-cookie API); fall back to a raw parse.
    let list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    if (list.length === 0) {
      const raw = res.headers.get("set-cookie");
      if (raw) list = raw.split(/,(?=[^;]+?=)/); // split on comma before a new name=
    }
    for (const sc of list) {
      const f = sc.split(";")[0], i = f.indexOf("=");
      if (i > 0) this.c.set(f.slice(0, i).trim(), f.slice(i + 1).trim());
    }
  }
}

const deEnt = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function parseInputs(html: string) {
  const out: { name: string; type: string; value: string; checked: boolean }[] = [];
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const t = m[0], name = (/\bname\s*=\s*"([^"]*)"/i.exec(t) || [])[1];
    if (!name) continue;
    out.push({
      name,
      type: ((/\btype\s*=\s*"([^"]*)"/i.exec(t) || [])[1] || "text").toLowerCase(),
      value: deEnt((/\bvalue\s*=\s*"([^"]*)"/i.exec(t) || [])[1] || ""),
      checked: /\bchecked\b/i.test(t),
    });
  }
  return out;
}

/** Serialize a full ASP.NET form (successful controls) into POST params. */
function serializeForm(html: string): { params: URLSearchParams; dateFields: string[]; submits: { name: string; value: string }[] } {
  const params = new URLSearchParams();
  const dateFields: string[] = [];
  const submits: { name: string; value: string }[] = [];
  for (const f of parseInputs(html)) {
    if (f.type === "submit" || f.type === "button" || f.type === "image") { submits.push({ name: f.name, value: f.value }); continue; }
    if (f.type === "checkbox" || f.type === "radio") { if (f.checked) params.append(f.name, f.value || "on"); continue; }
    params.set(f.name, f.value);
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(f.value) || /^\d{4}-\d{2}-\d{2}$/.test(f.value) || /from|to|date|start|end/i.test(f.name)) dateFields.push(f.name);
  }
  // selects -> selected option value
  for (const m of html.matchAll(/<select\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const name = m[1], inner = m[2];
    const sel = /<option\b[^>]*\bselected\b[^>]*\bvalue\s*=\s*"([^"]*)"/i.exec(inner) || /<option\b[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*\bselected\b/i.exec(inner) || /<option\b[^>]*\bvalue\s*=\s*"([^"]*)"/i.exec(inner);
    if (sel) params.set(name, deEnt(sel[1]));
  }
  for (const m of html.matchAll(/<textarea\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/textarea>/gi)) params.set(m[1], deEnt(m[2]));
  return { params, dateFields, submits };
}

async function once(url: string, init: RequestInit, jar: Jar, tries = 3): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal, headers: { Cookie: jar.header(), ...(init.headers || {}) } });
      clearTimeout(t);
      jar.absorb(res);
      if (res.status === 503 || res.status === 502) throw new Error(`upstream ${res.status}`);
      return res;
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
  throw new Error("unreachable");
}

async function get(url: string, init: RequestInit, jar: Jar, trace?: { status: number; url: string; loc?: string }[]): Promise<{ res: Response; finalUrl: string }> {
  let target = url, cur = init;
  for (let hop = 0; hop < 6; hop++) {
    const res = await once(target, cur, jar);
    const loc = res.headers.get("location") || undefined;
    trace?.push({ status: res.status, url: target.replace(BASE, ""), loc: loc?.replace(BASE, "") });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      if (!loc) return { res, finalUrl: target };
      target = new URL(loc, target).toString(); cur = { method: "GET" }; continue;
    }
    return { res, finalUrl: target };
  }
  throw new Error("too many redirects");
}

async function login(jar: Jar) {
  const page = await (await get(`${BASE}${LOGIN_PATH}`, { method: "GET" }, jar)).res.text();
  const inputs = parseInputs(page);
  const txtKey = inputs.find((f) => f.name === "StaffloginDialog$txtKey")?.value || "";
  const form = new URLSearchParams();
  for (const f of inputs) {
    if (/^(__EVENTTARGET|__EVENTARGUMENT|__VIEWSTATE|__VIEWSTATEGENERATOR)$/.test(f.name) || f.name === "StaffloginDialog$txtKey") form.set(f.name, f.value);
  }
  form.set("StaffloginDialog$txt_LoginName", USER);
  // Password is AES-encrypted with the per-load txtKey nonce, exactly as the page's Encrypt() does.
  form.set("StaffloginDialog$Txt_Password", txtKey ? encPassword(PASS, txtKey) : PASS);
  form.set("StaffloginDialog$Btn_Ok", "Login");
  // POST WITHOUT following, so we can read the AuthToken the login sets before anything clears it.
  const pRes = await once(`${BASE}${LOGIN_PATH}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE}${LOGIN_PATH}` }, body: form.toString() }, jar);
  const postStatus = pRes.status;
  const postLoc = (pRes.headers.get("location") || "").replace(BASE, "");
  const authAfterPost = jar.value("AuthToken") || "";
  // Visit the home page to establish/verify the session.
  const m = await get(`${BASE}${HOME_PATH}`, { method: "GET", headers: { Referer: `${BASE}${LOGIN_PATH}` } }, jar).catch(() => null);
  const mText = m ? await m.res.text() : "";
  return {
    postStatus, postLoc,
    authAfterPost: authAfterPost.slice(0, 10), authLen: authAfterPost.length,
    mainFinalUrl: m?.finalUrl ?? "(err)",
    mainOk: m ? !/LogOut/i.test(m.finalUrl) && !/Txt_Password/i.test(mText) : false,
  };
}

// ---- dates -----------------------------------------------------------------
function istNow(): Date { return new Date(Date.now() + 5.5 * 3600_000); }
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** eSSL Log Date (IST local) -> UTC ISO instant. Handles "25 Jul 2026 00:02:41"
 *  and numeric dd-MM-yyyy / yyyy-MM-dd / MM/dd/yyyy + HH:mm(:ss). */
function logDateToIso(s: string): string | null {
  s = (s || "").trim();
  let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return new Date(Date.UTC(+m[3], mo - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) - 5.5 * 3600_000).toISOString();
  }
  m = s.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    let y: number, mo: number, d: number;
    if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; } else { d = +m[1]; mo = +m[2]; y = +m[3]; }
    return new Date(Date.UTC(y, mo - 1, d, +m[4], +m[5], +(m[6] || 0)) - 5.5 * 3600_000).toISOString();
  }
  return null;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  // Detect delimiter (eSSL "Excel" exports are often tab-separated).
  const delim = (lines[0].match(/\t/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? "\t" : ",";
  const split = (l: string) => { const o: string[] = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o.map((x) => x.trim()); };
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l); const r: Record<string, string> = {}; headers.forEach((h, i) => (r[h] = v[i] ?? "")); return r; });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!CRON_SECRET || (req.headers.get("x-cron-secret") ?? "") !== CRON_SECRET) return json(401, { error: "Unauthorized" });
    if (!BASE || !USER || !PASS) return json(500, { error: "Missing ETIMETRACK_* secrets" });
    const body = await req.json().catch(() => ({}));

    // Assign a role + rights template to an EXISTING login (no eSSL needed).
    if (body?.grantAccess) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "accountant");
      const templateName = String(body.template || "");
      const replace = body?.replace === true || role === "owner"; // owner = sole role, no custom template
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const user = (list?.users || []).find((u) => (u.email || "").toLowerCase() === email);
      if (!user) return json(200, { ok: false, reason: "auth user not found — create the login first", email });
      if (replace) {
        await admin.from("user_roles").delete().eq("user_id", user.id);
        await admin.from("user_permissions").delete().eq("user_id", user.id);
      }
      await admin.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
      // Extra individual permission grants layered on top of the template (e.g.
      // salaries.view so an Administrator also sees confidential salary data).
      const extraGrants = Array.isArray(body?.grant)
        ? [...new Set(body.grant.map((s: unknown) => String(s).trim()).filter(Boolean))]
        : [];
      let templateFound = false;
      if ((templateName || extraGrants.length) && role !== "owner") {
        const row: Record<string, unknown> = { user_id: user.id };
        if (templateName) {
          const { data: tmpl } = await admin.from("rights_templates").select("id").eq("name", templateName).maybeSingle();
          if (tmpl) { row.template_id = (tmpl as { id: string }).id; templateFound = true; }
        }
        if (extraGrants.length) row.granted = extraGrants;
        await admin.from("user_permissions").upsert(row, { onConflict: "user_id" });
      }
      // Optionally link this login to a staff record (by device/employee code) so
      // their "My Account" view shows their own attendance/advances.
      let linkedStaff: string | null = null; let sessionsRelinked = 0; let sessionsRelinkError: string | null = null; let staleOpenSkipped = 0;
      const linkCode = String(body.linkStaffCode || "").trim();
      if (linkCode) {
        const { data: st } = await admin.from("staff").select("id, full_name").eq("employee_id", linkCode).maybeSingle();
        if (st) {
          const sid = (st as { id: string }).id;
          await admin.from("staff").update({ user_id: user.id }).eq("id", sid);
          // Sessions backfilled before this login existed carry user_id=NULL; relink
          // them so "My Account" shows the person's own history. The partial unique
          // index attendance_sessions_one_open_per_user allows only ONE open
          // (active/on_break) session per user_id, so: bulk-relink every CLOSED
          // session, then relink only the single most-recent open one. Older stale
          // opens (missed check-outs) are left unlinked.
          const { error: e1 } = await admin.from("attendance_sessions")
            .update({ user_id: user.id }).eq("staff_id", sid).is("user_id", null)
            .not("status", "in", "(active,on_break)");
          if (e1) sessionsRelinkError = e1.message;
          const { data: opens } = await admin.from("attendance_sessions")
            .select("id").eq("staff_id", sid).is("user_id", null).in("status", ["active", "on_break"])
            .order("check_in_at", { ascending: false }).limit(1);
          if (opens && opens.length) {
            const { error: e2 } = await admin.from("attendance_sessions").update({ user_id: user.id }).eq("id", (opens[0] as { id: string }).id);
            if (e2 && !sessionsRelinkError) sessionsRelinkError = e2.message;
          }
          const { count } = await admin.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("staff_id", sid).eq("user_id", user.id);
          const { count: stale } = await admin.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("staff_id", sid).is("user_id", null).in("status", ["active", "on_break"]);
          sessionsRelinked = count ?? 0;
          staleOpenSkipped = stale ?? 0;
          linkedStaff = (st as { full_name?: string }).full_name || linkCode;
        }
      }
      return json(200, { ok: true, email, userId: user.id, role, replaced: replace, template: role === "owner" ? null : templateName, templateFound, grants: extraGrants, linkedStaff, sessionsRelinked, staleOpenSkipped, sessionsRelinkError });
    }

    // Diagnostic: does this staff code have attendance, and is it linked to a login?
    if (body?.staffAudit) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const code = String(body.linkStaffCode || body.code || "").trim();
      const { data: st } = await admin.from("staff")
        .select("id, full_name, employee_id, user_id, outlet_id, attendance_tracked").eq("employee_id", code).maybeSingle();
      if (!st) return json(200, { ok: false, reason: "staff not found", code });
      const sid = (st as { id: string }).id;
      const uid = (st as { user_id?: string }).user_id ?? null;
      const totalR = await admin.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("staff_id", sid);
      const nullR = await admin.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("staff_id", sid).is("user_id", null);
      const byUserR = uid
        ? await admin.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("staff_id", sid).eq("user_id", uid)
        : { count: 0 };
      const { data: sample } = await admin.from("attendance_sessions")
        .select("work_date, check_in_at, check_out_at, user_id, status").eq("staff_id", sid)
        .order("check_in_at", { ascending: false }).limit(5);
      return json(200, { ok: true, staff: st, sessionsTotal: totalR.count ?? 0, sessionsNullUser: nullR.count ?? 0, sessionsMatchingStaffUser: byUserR.count ?? 0, recent: sample });
    }

    // One-time: load this connector's CRON_SECRET into Vault so the pg_cron job
    // (scheduled by migration) can authenticate. Secret comes from the function's
    // own env — never from git or the request body. Returns the current job status.
    if (body?.bootstrapCron) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { error: setErr } = await admin.rpc("set_etl_cron_secret", { p_secret: CRON_SECRET });
      const { data: status, error: stErr } = await admin.rpc("etl_cron_status");
      return json(200, { ok: !setErr, secretLoaded: !setErr, setError: setErr?.message ?? null, statusError: stErr?.message ?? null, status });
    }

    // Diagnostic + safety backfill: every linked staff should have role 'staff'
    // (unless owner/accountant). Reports role coverage and a given code's role.
    if (body?.rolesSummary) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data: staff } = await admin.from("staff").select("id, employee_id, user_id");
      const { data: roles } = await admin.from("user_roles").select("user_id, role");
      const roleByUser = new Map<string, string[]>();
      for (const r of (roles || []) as { user_id: string; role: string }[]) {
        (roleByUser.get(r.user_id) ?? roleByUser.set(r.user_id, []).get(r.user_id)!).push(r.role);
      }
      const counts: Record<string, number> = {};
      for (const arr of roleByUser.values()) for (const r of arr) counts[r] = (counts[r] || 0) + 1;
      let linkedNoRole = 0; const backfill = body.backfillStaffRole === true;
      const { data: staffTmpl } = await admin.from("rights_templates").select("id").eq("name", "Staff").maybeSingle();
      for (const s of (staff || []) as { id: string; user_id?: string | null }[]) {
        if (!s.user_id) continue;
        const rs = roleByUser.get(s.user_id) || [];
        if (rs.length === 0) {
          linkedNoRole++;
          if (backfill) {
            await admin.from("user_roles").upsert({ user_id: s.user_id, role: "staff" }, { onConflict: "user_id,role", ignoreDuplicates: true });
            if ((staffTmpl as { id: string } | null)?.id) await admin.from("user_permissions").upsert({ user_id: s.user_id, template_id: (staffTmpl as { id: string }).id }, { onConflict: "user_id" });
          }
        }
      }
      // K2H001's role + template
      const { data: k } = await admin.from("staff").select("user_id").eq("employee_id", "K2H001").maybeSingle();
      const kUid = (k as { user_id?: string } | null)?.user_id ?? null;
      const kRoles = kUid ? (roleByUser.get(kUid) || []) : [];
      let kTemplate: string | null = null;
      if (kUid) {
        const { data: up } = await admin.from("user_permissions").select("template_id").eq("user_id", kUid).maybeSingle();
        const tid = (up as { template_id?: string } | null)?.template_id;
        if (tid) { const { data: t } = await admin.from("rights_templates").select("name").eq("id", tid).maybeSingle(); kTemplate = (t as { name?: string } | null)?.name ?? null; }
      }
      return json(200, { ok: true, roleCounts: counts, linkedStaffWithoutRole: linkedNoRole, backfilled: backfill, staffTotal: (staff || []).length, K2H001: { roles: kRoles, template: kTemplate } });
    }

    // Apply an uploaded staff sheet (by employee code): update name / department /
    // designation / date_of_joining / monthly_salary (+ email/phone if present).
    if (body?.applyStaffFile) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      let updated = 0, inserted = 0; const errs: string[] = [];
      for (const r of rows) {
        const code = String(r?.employee_id ?? "").trim(); if (!code) continue;
        const patch: Record<string, unknown> = {};
        if (r.full_name) patch.full_name = String(r.full_name).trim();
        if (r.department) patch.department = String(r.department).trim();
        if (r.designation) patch.designation = String(r.designation).trim();
        if (r.date_of_joining) patch.date_of_joining = String(r.date_of_joining).slice(0, 10);
        if (r.monthly_salary !== null && r.monthly_salary !== undefined && r.monthly_salary !== "") patch.monthly_salary = Number(r.monthly_salary);
        if (r.email) patch.email = String(r.email).trim();
        if (r.phone) patch.phone = String(r.phone).replace(/\D/g, "");
        const { data: ex } = await admin.from("staff").select("id").eq("employee_id", code).maybeSingle();
        if (ex) { const { error } = await admin.from("staff").update(patch).eq("id", (ex as { id: string }).id); if (error) { if (errs.length < 3) errs.push(error.message); } else updated++; }
        else { const { error } = await admin.from("staff").insert({ employee_id: code, email: "", ...patch }); if (error) { if (errs.length < 3) errs.push(error.message); } else inserted++; }
      }
      return json(200, { ok: true, updated, inserted, total: rows.length, errs });
    }

    // Create a shift + assign it to EVERY active staff on all 7 weekdays, writing
    // both the new (shift_assignment / shift_day_timing) and legacy
    // (staff_shift_assignments) tables so payroll/discipline honour it.
    if (body?.assignDefaultShift) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const name = String(body.name || "Night 4 PM – 2 AM");
      const cin = String(body.check_in || "16:00");
      const cout = String(body.check_out || "02:00");
      const errs: string[] = [];
      let shiftId: string | null = null;
      const { data: exShift } = await admin.from("shifts").select("id").eq("name", name).maybeSingle();
      if (exShift) { shiftId = (exShift as { id: string }).id; await admin.from("shifts").update({ check_in_time: cin, check_out_time: cout, is_active: true }).eq("id", shiftId); }
      else { const { data: ns, error } = await admin.from("shifts").insert({ name, check_in_time: cin, check_out_time: cout }).select("id").maybeSingle(); if (error) return json(200, { ok: false, stage: "shift", error: error.message }); shiftId = (ns as { id: string } | null)?.id ?? null; }
      if (!shiftId) return json(200, { ok: false, reason: "no shift id" });
      const week = [0, 1, 2, 3, 4, 5, 6];
      await admin.from("shift_day_timing").upsert(week.map((w) => ({ shift_id: shiftId, weekday: w, start_time: cin, end_time: cout })), { onConflict: "shift_id,weekday" });
      const { data: staff } = await admin.from("staff").select("id").eq("is_active", true);
      const asn: Record<string, unknown>[] = []; const legacy: Record<string, unknown>[] = [];
      for (const s of (staff || []) as { id: string }[]) { for (const w of week) asn.push({ staff_id: s.id, weekday: w, shift_id: shiftId }); legacy.push({ staff_id: s.id, shift_id: shiftId }); }
      let asnUp = 0, legUp = 0;
      for (let i = 0; i < asn.length; i += 500) { const { error } = await admin.from("shift_assignment").upsert(asn.slice(i, i + 500), { onConflict: "staff_id,weekday" }); if (error) { if (errs.length < 3) errs.push("asn: " + error.message); } else asnUp += Math.min(500, asn.length - i); }
      for (let i = 0; i < legacy.length; i += 500) { const { error } = await admin.from("staff_shift_assignments").upsert(legacy.slice(i, i + 500), { onConflict: "staff_id" }); if (error) { if (errs.length < 3) errs.push("legacy: " + error.message); } else legUp += Math.min(500, legacy.length - i); }
      return json(200, { ok: errs.length === 0, shiftId, name, check_in: cin, check_out: cout, staff: (staff || []).length, shiftAssignments: asnUp, legacyAssignments: legUp, errs });
    }

    // Analyze biometric history → per-staff shift pattern, clustered into shift
    // types (with cross-midnight detection). For the "recommend shifts" report.
    if (body?.shiftAnalysis) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data, error } = await admin.rpc("shift_pattern_analysis");
      if (error) return json(200, { ok: false, error: error.message });
      type Row = { employee_id: string; full_name: string; department: string | null; sessions: number; median_in_hour: number | null; p25_in_hour: number | null; p75_in_hour: number | null; median_out_hour: number | null; cross_midnight_pct: number | null; single_punch_pct: number | null; avg_worked_min: number | null };
      const rows = (data || []) as Row[];
      const hhmm = (h: number | null) => h == null ? "—" : `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
      const isNight = (r: Row) => r.median_in_hour != null && ((r.median_out_hour != null && r.median_out_hour < r.median_in_hour - 1) || (r.cross_midnight_pct ?? 0) > 25);
      const classify = (r: Row): string => {
        const mi = r.median_in_hour; if (mi == null) return "Unknown";
        if ((r.single_punch_pct ?? 0) >= 60) return "Single-punch (presence only)";
        if (isNight(r)) return mi >= 17 ? "Night: evening→~2am" : (mi >= 13 ? "Long/overnight: afternoon→morning" : "Overnight: midday→morning");
        if (mi < 7) return "Early morning (before 7)";
        if (mi < 10) return "Morning (7–10)";
        if (mi < 12.5) return "Late morning (10–12:30)";
        if (mi < 15) return "Midday (12:30–15)";
        return "Afternoon start (15–17, same day)";
      };
      const checkinHist: Record<string, number> = {}, checkoutHist: Record<string, number> = {};
      const clusters: Record<string, { count: number; ins: number[]; outs: number[]; xmid: number[]; depts: Record<string, number>; samples: string[] }> = {};
      const byDept: Record<string, { staff: number; night: number; inSum: number; outN: number; outSum: number }> = {};
      let nightStaff = 0, singlePunchStaff = 0;
      for (const r of rows) {
        if (r.median_in_hour != null) checkinHist[String(Math.floor(r.median_in_hour))] = (checkinHist[String(Math.floor(r.median_in_hour))] || 0) + 1;
        if (r.median_out_hour != null) checkoutHist[String(Math.floor(r.median_out_hour))] = (checkoutHist[String(Math.floor(r.median_out_hour))] || 0) + 1;
        const c = classify(r);
        const cl = clusters[c] ?? (clusters[c] = { count: 0, ins: [], outs: [], xmid: [], depts: {}, samples: [] });
        cl.count++; if (r.median_in_hour != null) cl.ins.push(r.median_in_hour); if (r.median_out_hour != null) cl.outs.push(r.median_out_hour); cl.xmid.push(r.cross_midnight_pct ?? 0);
        const dep = r.department || "—"; cl.depts[dep] = (cl.depts[dep] || 0) + 1;
        if (cl.samples.length < 6) cl.samples.push(`${r.employee_id} ${r.full_name}`);
        if (isNight(r)) nightStaff++; if ((r.single_punch_pct ?? 0) >= 60) singlePunchStaff++;
        const d = byDept[dep] ?? (byDept[dep] = { staff: 0, night: 0, inSum: 0, outN: 0, outSum: 0 });
        d.staff++; if (isNight(r)) d.night++; if (r.median_in_hour != null) d.inSum += r.median_in_hour; if (r.median_out_hour != null) { d.outN++; d.outSum += r.median_out_hour; }
      }
      const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      const clusterOut = Object.entries(clusters).map(([name, c]) => ({ shift: name, staff: c.count, typicalIn: hhmm(med(c.ins)), typicalOut: hhmm(med(c.outs)), avgCrossMidnightPct: Math.round(c.xmid.reduce((a, b) => a + b, 0) / c.xmid.length), topDepts: Object.entries(c.depts).sort((a, b) => b[1] - a[1]).slice(0, 4), samples: c.samples })).sort((a, b) => b.staff - a.staff);
      const deptOut = Object.entries(byDept).map(([dep, d]) => ({ department: dep, staff: d.staff, nightPct: Math.round(100 * d.night / d.staff), typicalIn: hhmm(d.inSum / d.staff), typicalOut: d.outN ? hhmm(d.outSum / d.outN) : "—" })).sort((a, b) => b.staff - a.staff);
      return json(200, { ok: true, totalStaff: rows.length, nightStaff, singlePunchStaff, checkinHist, checkoutHist, clusters: clusterOut, byDepartment: deptOut });
    }

    // Create the 3 recommended shifts and assign each staff to their best-fit one
    // from their own biometric pattern. Writes new + legacy tables + timings.
    if (body?.assignShiftsByPattern) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const defs = [
        { key: "A", name: "General (11 AM – 8 PM)", cin: "11:00", cout: "20:00" },
        { key: "B", name: "Afternoon (2 PM – 11 PM)", cin: "14:00", cout: "23:00" },
        { key: "C", name: "Evening / Closing (4 PM – 1 AM)", cin: "16:00", cout: "01:00" },
      ];
      const shiftId: Record<string, string> = {}; const week = [0, 1, 2, 3, 4, 5, 6];
      for (const d of defs) {
        let id: string | null = null;
        const { data: ex } = await admin.from("shifts").select("id").eq("name", d.name).maybeSingle();
        if (ex) { id = (ex as { id: string }).id; await admin.from("shifts").update({ check_in_time: d.cin, check_out_time: d.cout, is_active: true }).eq("id", id); }
        else { const { data: ns, error } = await admin.from("shifts").insert({ name: d.name, check_in_time: d.cin, check_out_time: d.cout }).select("id").maybeSingle(); if (error) return json(200, { ok: false, stage: "shift " + d.key, error: error.message }); id = (ns as { id: string } | null)?.id ?? null; }
        if (!id) return json(200, { ok: false, reason: "no shift id " + d.key });
        shiftId[d.key] = id;
        await admin.from("shift_day_timing").upsert(week.map((w) => ({ shift_id: id, weekday: w, start_time: d.cin, end_time: d.cout })), { onConflict: "shift_id,weekday" });
      }
      const { data: pat, error: perr } = await admin.rpc("shift_pattern_analysis");
      if (perr) return json(200, { ok: false, error: perr.message });
      const classify = (r: { median_in_hour: number | null; median_out_hour: number | null; cross_midnight_pct: number | null }): string => {
        const mi = r.median_in_hour; if (mi == null) return "B";
        const night = (r.median_out_hour != null && r.median_out_hour < mi - 1) || (r.cross_midnight_pct ?? 0) > 25;
        if (night) return "C";
        if (mi < 12.5) return "A";
        if (mi < 15) return "B";
        return "C";
      };
      const byCode = new Map<string, string>();
      for (const r of (pat || []) as { employee_id: string; median_in_hour: number | null; median_out_hour: number | null; cross_midnight_pct: number | null }[]) byCode.set(String(r.employee_id).trim(), classify(r));
      const { data: staff } = await admin.from("staff").select("id, employee_id").eq("is_active", true);
      const asn: Record<string, unknown>[] = []; const legacy: Record<string, unknown>[] = [];
      const assignCounts: Record<string, number> = { A: 0, B: 0, C: 0 }; let defaulted = 0;
      for (const s of (staff || []) as { id: string; employee_id?: string }[]) {
        let k = byCode.get(String(s.employee_id ?? "").trim());
        if (!k) { k = "B"; defaulted++; }
        assignCounts[k]++;
        const sid = shiftId[k];
        for (const w of week) asn.push({ staff_id: s.id, weekday: w, shift_id: sid });
        legacy.push({ staff_id: s.id, shift_id: sid });
      }
      const errs: string[] = []; let asnUp = 0, legUp = 0;
      for (let i = 0; i < asn.length; i += 500) { const { error } = await admin.from("shift_assignment").upsert(asn.slice(i, i + 500), { onConflict: "staff_id,weekday" }); if (error) { if (errs.length < 3) errs.push("asn: " + error.message); } else asnUp += Math.min(500, asn.length - i); }
      for (let i = 0; i < legacy.length; i += 500) { const { error } = await admin.from("staff_shift_assignments").upsert(legacy.slice(i, i + 500), { onConflict: "staff_id" }); if (error) { if (errs.length < 3) errs.push("legacy: " + error.message); } else legUp += Math.min(500, legacy.length - i); }
      return json(200, { ok: errs.length === 0, shifts: defs.map((d) => ({ key: d.key, name: d.name, timing: `${d.cin}–${d.cout}`, staff: assignCounts[d.key] })), defaultedToB: defaulted, staffTotal: (staff || []).length, shiftAssignments: asnUp, legacyAssignments: legUp, errs });
    }

    // Provision a login for EVERY staff member, keyed on their employee code:
    // email = <code>@<domain>, bootstrap password = the code (they set their own on
    // first login), role 'staff' + Staff template, onboarding_completed=false.
    // Idempotent + resumable — staff already linked to a login are skipped.
    if (body?.provisionStaffLogins) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const domain = String(body.domain || Deno.env.get("PHONE_EMAIL_DOMAIN") || "hr-buddy-nine.vercel.app").trim();
      const { data: staff } = await admin.from("staff").select("id, employee_id, user_id, is_active");
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const byEmail = new Map<string, string>((list?.users || []).map((u) => [(u.email || "").toLowerCase(), u.id]));
      const { data: tmpl } = await admin.from("rights_templates").select("id").eq("name", "Staff").maybeSingle();
      const tmplId = (tmpl as { id: string } | null)?.id ?? null;
      const limit = Number(body.limit) || 60; // bounded per call so the fn returns before its wall limit
      let created = 0, linked = 0, skipped = 0, remaining = 0; const errs: string[] = [];
      for (const s of (staff || []) as { id: string; employee_id?: string; user_id?: string | null }[]) {
        const code = String(s.employee_id ?? "").trim(); if (!code) { skipped++; continue; }
        if (s.user_id) { skipped++; continue; } // already has a login
        if (linked >= limit) { remaining++; continue; }
        const email = `${code.toLowerCase()}@${domain}`;
        let uid = byEmail.get(email);
        if (!uid) {
          const { data: cu, error } = await admin.auth.admin.createUser({ email, password: code.toLowerCase(), email_confirm: true });
          if (error || !cu?.user) { if (errs.length < 5) errs.push(`${code}: ${error?.message ?? "create failed"}`); continue; }
          uid = cu.user.id; created++;
        }
        await admin.from("staff").update({ user_id: uid, onboarding_completed: false }).eq("id", s.id);
        await admin.from("user_roles").upsert({ user_id: uid, role: "staff" }, { onConflict: "user_id,role", ignoreDuplicates: true });
        if (tmplId) await admin.from("user_permissions").upsert({ user_id: uid, template_id: tmplId }, { onConflict: "user_id" });
        linked++;
      }
      return json(200, { ok: true, created, linked, skipped, remaining, done: remaining === 0, domain, errs });
    }

    // Diagnostic: overall attendance data quality (how "wrong" is the backfill?).
    if (body?.attendanceQuality) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const cnt = async (b: (q: any) => any) => (await b(admin.from("attendance_sessions").select("id", { count: "exact", head: true }))).count ?? 0;
      const staleCutoff = new Date(Date.now() - 20 * 3600_000).toISOString();
      const total       = await cnt((q: any) => q);
      const biometric   = await cnt((q: any) => q.eq("source", "biometric"));
      const open        = await cnt((q: any) => q.in("status", ["active", "on_break"]));
      const completed   = await cnt((q: any) => q.eq("status", "completed"));
      const noCheckout  = await cnt((q: any) => q.is("check_out_at", null));
      const staleOpen   = await cnt((q: any) => q.in("status", ["active", "on_break"]).lt("check_in_at", staleCutoff));
      const zeroMinutes = await cnt((q: any) => q.eq("status", "completed").eq("worked_minutes", 0));
      const over16h     = await cnt((q: any) => q.gt("worked_minutes", 16 * 60));
      // worst offenders: staff with the most open sessions (sample via per-staff counts)
      const { data: staffRows } = await admin.from("staff").select("id, full_name, employee_id").eq("is_active", true);
      const worst: { code: string; name: string; open: number; total: number }[] = [];
      for (const s of (staffRows ?? []).slice(0, 400)) {
        const sr = s as { id: string; full_name?: string; employee_id?: string };
        const o = await cnt((q: any) => q.eq("staff_id", sr.id).in("status", ["active", "on_break"]));
        if (o >= 5) { const t = await cnt((q: any) => q.eq("staff_id", sr.id)); worst.push({ code: sr.employee_id ?? "", name: sr.full_name ?? "", open: o, total: t }); }
      }
      worst.sort((a, b) => b.open - a.open);
      return json(200, { ok: true, total, biometric, open, completed, noCheckout, staleOpen, zeroMinutes, over16h, staffWithManyOpens: worst.length, worst: worst.slice(0, 15) });
    }

    // Probe which tables exist (multi-tenant foundation applied or not?).
    if (body?.probeTables) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const out: Record<string, unknown> = {};
      for (const t of ["organizations", "org_features", "organization_profile"]) {
        const { data, error } = await admin.from(t).select("*").limit(3);
        out[t] = error ? { exists: false, error: error.message } : { exists: true, rows: (data as unknown[])?.length ?? 0, sample: data };
      }
      return json(200, { ok: true, tables: out });
    }

    // Repair: rebuild biometric attendance as one session per (staff, day),
    // first punch -> last punch. Fixes the ~47% unclosed / cross-midnight mess.
    if (body?.consolidateAttendance) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data, error } = await admin.rpc("consolidate_biometric_attendance");
      return json(200, { ok: !error, error: error?.message ?? null, result: data });
    }

    // Repair (gap-based): correct for day AND overnight shifts. Splits punches into
    // sessions wherever the gap > body.maxGapMin (default 720 = 12h).
    if (body?.rebuildByGap) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data, error } = await admin.rpc("rebuild_sessions_by_gap", { _max_gap_min: Number(body.maxGapMin) || 720 });
      return json(200, { ok: !error, error: error?.message ?? null, result: data });
    }

    const jar = new Jar();
    const diag = await login(jar);
    if (body?.probe) return json(200, { ok: true, cookies: jar.names(), ...diag });

    if (body?.menu) {
      const html = await (await get(`${BASE}${HOME_PATH}`, { method: "GET", headers: { Referer: `${BASE}${LOGIN_PATH}` } }, jar)).res.text();
      const links = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((a) => {
        const href = (/\bhref\s*=\s*"([^"]*)"/i.exec(a[0]) || [])[1] || "";
        const onclick = (/\bonclick\s*=\s*"([^"]*)"/i.exec(a[0]) || [])[1] || "";
        const text = a[0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return { text, nav: (href && href !== "#" ? href : onclick).slice(0, 100) };
      }).filter((l) => l.text && /report|log|record|export|matrix/i.test(l.text + l.nav)).slice(0, 50);
      const reportUrls = [...new Set([...html.matchAll(/[A-Za-z0-9_./]*(?:Report|Log|Record|Export)[A-Za-z0-9_]*\.aspx(?:\?[A-Za-z0-9=&]+)?/gi)].map((m) => m[0]))].slice(0, 40);
      return json(200, { ok: true, links, reportUrls });
    }

    if (body?.probeUrl) {
      const path = String(body.probeUrl).replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(iclock\/)?/, "");
      const { res, finalUrl } = await get(`${BASE}/iclock/${path}`, { method: "GET", headers: { Referer: `${BASE}${HOME_PATH}` } }, jar);
      const html = await res.text();
      const inputs = parseInputs(html).filter((f) => !/VIEWSTATE|EVENTVALIDATION/.test(f.name)).map((f) => ({ name: f.name, type: f.type, value: f.value.slice(0, 25) }));
      const selOpts: Record<string, { value: string; text: string }[]> = {};
      for (const m of html.matchAll(/<select\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
        selOpts[m[1]] = [...m[2].matchAll(/<option\b[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*>([^<]*)</gi)].map((o) => ({ value: o[1], text: o[2].trim() })).slice(0, 5);
      }
      const submits = [...html.matchAll(/<input\b[^>]*type\s*=\s*"(?:submit|button)"[^>]*>/gi)].map((m) => ({ name: (/\bname="([^"]*)"/i.exec(m[0]) || [])[1], value: (/\bvalue="([^"]*)"/i.exec(m[0]) || [])[1] }));
      return json(200, { ok: true, finalUrl, onLogin: /Txt_Password/i.test(html), selOpts, submits: submits.slice(0, 15) });
    }

    // ---- fetch the report form + submit it for the CSV ----------------------
    const { res: gres, finalUrl } = await get(`${BASE}${REPORT_PATH}`, { method: "GET", headers: { Referer: `${BASE}${HOME_PATH}` } }, jar);
    const formHtml = await gres.text();
    if (/Txt_Password/i.test(formHtml) || /LogOut\.aspx/i.test(finalUrl)) {
      return json(200, { ok: false, stage: "report-page", reason: "session bounced to login/logout", finalUrl, cookies: jar.names(), hint: "AuthToken cookie likely not captured/valid at login." });
    }

    const { params, submits } = serializeForm(formHtml);
    if (body?.discover) {
      const sel: Record<string, { value: string; text: string }[]> = {};
      for (const m of formHtml.matchAll(/<select\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
        if (!/exportToCsv|Drp_(From|To)Date|Format|export/i.test(m[1])) continue;
        sel[m[1]] = [...m[2].matchAll(/<option\b[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*>([^<]*)</gi)].map((o) => ({ value: o[1], text: o[2].trim() })).slice(0, 8);
      }
      const hdn = Object.fromEntries([...params].filter(([k]) => /Hdn_|Export|IncludeHeader|lst_export/i.test(k)).map(([k, v]) => [k, (v || "").slice(0, 100)]));
      return json(200, { ok: true, finalUrl, submits, selectOptions: sel, hdn });
    }

    // DeviceLogList filters within one month: from-day..to-day of month/year.
    // Pull the current month, (today-2) -> today (IST), zero-padded values.
    const now = istNow();
    const pad = (n: number) => String(n).padStart(2, "0");
    const yr = Number(body?.year) || now.getUTCFullYear();
    const mo = Number(body?.month) || (now.getUTCMonth() + 1);
    const wholeMonth = !!(body?.backfill || body?.employees || body?.importStaff || body?.importBiometric) || yr !== now.getUTCFullYear() || mo !== now.getUTCMonth() + 1;
    params.set("ddlYear", String(yr));
    params.set("ddlMonth", pad(mo));
    const backDays = Number(body?.days) || 0; // e.g. cron: last few days of the current month
    params.set("ddlFromDate", backDays > 0 ? pad(Math.max(1, now.getUTCDate() - backDays)) : (wholeMonth ? "01" : pad(Math.max(1, now.getUTCDate() - 2))));
    params.set("ddlToDate", wholeMonth ? pad(new Date(Date.UTC(yr, mo, 0)).getUTCDate()) : pad(now.getUTCDate()));
    params.set("drp_Devices", "0");     // all devices
    params.set("drp_VerifyMode", "0");  // all verify modes
    params.set("ddlSortBy", "LogDate");
    params.set("ddlSortOrder", "Asc");
    params.set("txtPageSize", "50000"); // don't let paging cap the export
    params.set("btnExport", "Export");

    const csvRes = await get(`${BASE}${REPORT_PATH}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE}${REPORT_PATH}` }, body: params.toString() }, jar);
    const csvText = await csvRes.res.text();
    const ct = csvRes.res.headers.get("content-type") || "";
    const looksCsv = /UserId|Log ?Date|Download Date|Employee Code/i.test(csvText.slice(0, 500)) || /excel|csv|octet-stream|vnd\./i.test(ct);
    if (!looksCsv) {
      return json(200, { ok: false, stage: "report-post", reason: "response was not the CSV", contentType: ct, csvLen: csvText.length, head: csvText.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/\s+/g, " ").slice(0, 500) });
    }

    // ---- map DeviceLogList rows -> events -----------------------------------
    // Columns: Download Date | UserId | User Name | Log Date | Device Name |
    //          Serial Number | Att State (Check-In/Check-Out) | Verify Mode | GPS
    const rows = parseCsv(csvText);
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: staff } = await db.from("staff").select("id, employee_id");
    const byCode = new Map<string, string>();
    for (const s of staff ?? []) if (s.employee_id) byCode.set(String(s.employee_id).trim(), s.id);

    const col = (r: Record<string, string>, ...names: string[]) => {
      for (const n of names) { const k = Object.keys(r).find((h) => h.trim().toLowerCase() === n.toLowerCase()); if (k && r[k]?.trim()) return r[k].trim(); }
      return "";
    };

    // Unique employees (code, name, devices seen) derived from the logs.
    if (body?.employees) {
      const emps = new Map<string, { name: string; devices: Set<string>; count: number }>();
      for (const r of rows) {
        const code = col(r, "UserId", "Employee Code In Device", "Employee Code");
        if (!code) continue;
        const e = emps.get(code) ?? { name: col(r, "User Name", "Employee Name"), devices: new Set<string>(), count: 0 };
        e.count++;
        const dev = col(r, "Device Name");
        if (dev) e.devices.add(dev);
        if (!e.name) e.name = col(r, "User Name", "Employee Name");
        emps.set(code, e);
      }
      return json(200, { ok: true, total: emps.size, employees: [...emps].map(([code, e]) => ({ code, name: e.name, devices: [...e.devices], punches: e.count })) });
    }

    // Bootstrap the HR DB: org "Konnect 2 Hospitality" + outlets (device names) + staff.
    if (body?.importStaff) {
      const devSel = (/<select\b[^>]*\bname\s*=\s*"[^"]*drp_Devices"[^>]*>([\s\S]*?)<\/select>/i.exec(formHtml) || [])[1] || "";
      const deviceNames = [...devSel.matchAll(/<option\b[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*>([^<]*)</gi)]
        .map((m) => m[2].trim()).filter((n) => n && !/^all$/i.test(n));

      const emps = new Map<string, { name: string; dev: Map<string, number> }>();
      for (const r of rows) {
        const code = col(r, "UserId", "Employee Code In Device"); if (!code) continue;
        const e = emps.get(code) ?? { name: col(r, "User Name"), dev: new Map<string, number>() };
        if (!e.name) e.name = col(r, "User Name");
        const d = col(r, "Device Name"); if (d) e.dev.set(d, (e.dev.get(d) || 0) + 1);
        emps.set(code, e);
      }
      for (const e of emps.values()) for (const d of e.dev.keys()) if (!deviceNames.includes(d)) deviceNames.push(d);

      // 1. Organisation profile
      await db.from("organization_profile").update({ trade_name: "Konnect 2 Hospitality", onboarded_at: new Date().toISOString() }).eq("singleton", true);

      // 2. Outlets (one per device name), name -> id
      const outletId = new Map<string, string>();
      for (const name of [...new Set(deviceNames)]) {
        const { data } = await db.from("outlets").upsert({ name }, { onConflict: "name" }).select("id, name").single();
        if (data) outletId.set(name, data.id);
      }

      // 3. Staff (upsert by employee_id), mapped to their most-used device's outlet
      let upserted = 0, failed = 0; const errs: string[] = [];
      for (const [code, e] of emps) {
        const primary = [...e.dev].sort((a, b) => b[1] - a[1])[0]?.[0];
        const { error } = await db.from("staff").upsert(
          { employee_id: code, full_name: e.name || code, email: "", monthly_salary: 0, is_active: true, outlet_id: (primary && outletId.get(primary)) || null },
          { onConflict: "employee_id" },
        );
        if (error) { failed++; if (errs.length < 3) errs.push(error.message); } else upserted++;
      }
      return json(200, { ok: true, org: "Konnect 2 Hospitality", outlets: [...outletId.keys()], employees: emps.size, staffUpserted: upserted, failed, errs });
    }

    // Direct session builder: pair Check-In/Check-Out into attendance_sessions
    // (idempotent upsert on staff_id + check_in_at). Right tool for bulk history.
    if (body?.backfill) {
      const { data: staffRows } = await db.from("staff").select("id, employee_id, user_id");
      const codeToId = new Map<string, string>(); const idToUser = new Map<string, string | null>();
      for (const s of staffRows ?? []) { const sr = s as { id: string; employee_id?: string; user_id?: string | null }; if (sr.employee_id) codeToId.set(String(sr.employee_id).trim(), sr.id); idToUser.set(sr.id, sr.user_id ?? null); }

      // GAP-based sessionization (matches rebuild_sessions_by_gap): sort each
      // staff's punches; a gap > 12h starts a new session. check-in = first punch,
      // check-out = last, attributed to the check-in's calendar date (IST). Correct
      // for day shifts AND overnight shifts (a 4pm–2am shift's 10h gap stays one
      // session; the 14h gap to the next day always splits days).
      // Keep this in lock-step with rebuild_sessions_by_gap() (the daily rebuild):
      //  • coalesce confirm double-taps within 5 min into one punch,
      //  • split visits on a >12h gap, EXCEPT an early-morning punch (<10:00 IST,
      //    within 20h) is the trailing checkout of the previous overnight shift,
      //  • a lone early-morning punch is attributed to the previous day.
      const MAX_GAP_MS = 12 * 3600_000;
      const DEDUP_MS = 5 * 60_000;
      const LATE_MERGE_MS = 20 * 3600_000;
      const MORNING_END = 10; // no shift starts before 10:00 IST here
      const istHour = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).getUTCHours();
      const wdOf = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
      const wdPrev = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000 - 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
      const byStaff = new Map<string, string[]>();
      let unmatchedB = 0;
      for (const r of rows) {
        const sid = codeToId.get(col(r, "UserId", "Employee Code In Device")); if (!sid) { unmatchedB++; continue; }
        const iso = logDateToIso(col(r, "Log Date")); if (!iso) continue;
        (byStaff.get(sid) ?? byStaff.set(sid, []).get(sid)!).push(iso);
      }
      const todayWd = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
      const sessions: Array<Record<string, unknown>> = [];
      for (const [sid, isos] of byStaff) {
        // Coalesce: keep the earliest punch of each cluster of taps <= 5 min apart.
        const sorted = [...new Set(isos)].sort();
        const uniq: string[] = [];
        let prevT: number | null = null;
        for (const t of sorted) {
          const tm = new Date(t).getTime();
          if (prevT === null || tm - prevT > DEDUP_MS) uniq.push(t);
          prevT = tm;
        }
        let start = 0;
        for (let i = 0; i < uniq.length; i++) {
          let boundary = i === uniq.length - 1;
          if (!boundary) {
            const gap = new Date(uniq[i + 1]).getTime() - new Date(uniq[i]).getTime();
            if (gap > MAX_GAP_MS) {
              const nextIsTrailingMorning = istHour(uniq[i + 1]) < MORNING_END && gap <= LATE_MERGE_MS;
              if (!nextIsTrailingMorning) boundary = true;
            }
          }
          if (boundary) {
            const first = uniq[start], last = uniq[i];
            const closed = last > first;
            const loneMorning = !closed && istHour(first) < MORNING_END;
            const wd = loneMorning ? wdPrev(first) : wdOf(first);
            sessions.push({
              staff_id: sid, user_id: idToUser.get(sid) ?? null, work_date: wd, check_in_at: first,
              check_out_at: closed ? last : null,
              worked_minutes: closed ? Math.max(0, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 60000)) : null,
              status: (!closed && wd === todayWd) ? "active" : "completed",
              source: "biometric", check_in_photo_url: "biometric",
            });
            start = i + 1;
          }
        }
      }

      let up = 0; const errB: string[] = [];
      for (let i = 0; i < sessions.length; i += 500) {
        const { error } = await db.from("attendance_sessions").upsert(sessions.slice(i, i + 500), { onConflict: "staff_id,check_in_at", ignoreDuplicates: false });
        if (error) { if (errB.length < 3) errB.push(error.message); } else up += Math.min(500, sessions.length - i);
      }
      // The connector just polled the device successfully — mark it live so the
      // Hardware screen shows "seen just now" instead of a stale timestamp. Also
      // refresh each physical device seen in this pull to its latest punch time.
      const nowIso = new Date().toISOString();
      await db.from("biometric_devices").update({ last_seen_at: nowIso, status: "online" }).eq("id", "e551e551-0000-0000-0000-000000000001");
      const devLastSeen = new Map<string, string>();
      for (const r of rows) {
        const serial = col(r, "Serial Number"); const iso = logDateToIso(col(r, "Log Date"));
        if (serial && iso) { const cur = devLastSeen.get(serial); if (!cur || iso > cur) devLastSeen.set(serial, iso); }
      }
      for (const [serial, iso] of devLastSeen) {
        await db.from("biometric_devices").update({ last_seen_at: iso }).eq("serial", serial);
      }
      return json(200, { ok: true, month: `${yr}-${pad(mo)}`, rows: rows.length, staffWithPunches: byStaffDay.size, sessionsBuilt: sessions.length, upserted: up, unmatched: unmatchedB, errs: errB, devicesTouched: devLastSeen.size });
    }

    // Populate biometric hardware + enrolments from the connector (so the Devices +
    // Enrolment screens show the real devices and everyone as enrolled — no manual work).
    if (body?.importBiometric) {
      const devInfo = new Map<string, string>(); // device name -> serial
      // ALL devices from the DeviceLogList device filter (not only ones active this month)
      const devSel = (/<select\b[^>]*\bname\s*=\s*"[^"]*drp_Devices"[^>]*>([\s\S]*?)<\/select>/i.exec(formHtml) || [])[1] || "";
      for (const m of devSel.matchAll(/<option\b[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*>([^<]*)</gi)) { const n = m[2].trim(); if (n && !/^all$/i.test(n)) devInfo.set(n, ""); }
      // fill serials from the punch data where available
      for (const r of rows) { const d = col(r, "Device Name"); const ser = col(r, "Serial Number"); if (d && ser && !devInfo.get(d)) devInfo.set(d, ser); }
      const { data: outletsD } = await db.from("outlets").select("id, name");
      const outletByName = new Map((outletsD ?? []).map((o) => [(o as { name: string }).name, (o as { id: string }).id]));
      const { data: exDev } = await db.from("biometric_devices").select("id, label");
      const devIdByLabel = new Map((exDev ?? []).map((d) => [(d as { label: string }).label, (d as { id: string }).id]));
      let devicesCreated = 0;
      for (const [name, serial] of devInfo) {
        if (devIdByLabel.has(name)) continue;
        const { data } = await db.from("biometric_devices").insert({ label: name, serial: serial || null, outlet_id: outletByName.get(name) ?? null, type: "fingerprint", is_active: true, status: "online" }).select("id").maybeSingle();
        if (data) { devIdByLabel.set(name, (data as { id: string }).id); devicesCreated++; }
      }

      const { data: staffRows } = await db.from("staff").select("id, employee_id");
      const codeToId = new Map((staffRows ?? []).filter((s) => (s as { employee_id?: string }).employee_id).map((s) => [String((s as { employee_id: string }).employee_id).trim(), (s as { id: string }).id]));
      const devCount = new Map<string, Map<string, number>>();
      for (const r of rows) { const sid = codeToId.get(col(r, "UserId")); const d = col(r, "Device Name"); if (!sid || !d) continue; const m = devCount.get(sid) ?? new Map<string, number>(); m.set(d, (m.get(d) || 0) + 1); devCount.set(sid, m); }
      const { data: exEnr } = await db.from("biometric_enrolments").select("staff_id");
      const enrolled = new Set((exEnr ?? []).map((e) => (e as { staff_id: string }).staff_id));
      const toInsert: Record<string, unknown>[] = [];
      for (const [sid, m] of devCount) {
        if (enrolled.has(sid)) continue;
        const primary = [...m].sort((a, b) => b[1] - a[1])[0][0];
        toInsert.push({ staff_id: sid, device_id: devIdByLabel.get(primary) ?? null, kind: "fingerprint", status: "enrolled", enrolled_at: new Date().toISOString() });
      }
      let enrCreated = 0; const errBio: string[] = [];
      for (let i = 0; i < toInsert.length; i += 500) {
        const { error } = await db.from("biometric_enrolments").insert(toInsert.slice(i, i + 500));
        if (error) { if (errBio.length < 3) errBio.push(error.message); } else enrCreated += Math.min(500, toInsert.length - i);
      }
      return json(200, { ok: true, devices: [...devInfo.keys()], devicesCreated, enrolmentsCreated: enrCreated, staffWithPunches: devCount.size, errs: errBio });
    }

    type Ev = { staff_id: string; ts: string; work_date: string; raw_ref: string };
    const events: (Ev & { direction: "in" | "out" })[] = [];
    const undirected = new Map<string, Ev[]>();
    let unmatched = 0, badDate = 0;
    for (const r of rows) {
      const code = col(r, "UserId", "Employee Code In Device", "User Id", "Employee Code");
      const staffId = code ? byCode.get(code) : undefined;
      if (!staffId) { if (code) unmatched++; continue; }
      const rawDate = col(r, "Log Date", "LogDate");
      const iso = logDateToIso(rawDate);
      if (!iso) { badDate++; continue; }
      const ist = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
      const wd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
      const raw_ref = `etl:${code}:${rawDate}`;
      const att = col(r, "Att State", "AttState", "Status", "Direction").toLowerCase();
      if (att.includes("out")) events.push({ staff_id: staffId, direction: "out", ts: iso, work_date: wd, raw_ref });
      else if (att.includes("in")) events.push({ staff_id: staffId, direction: "in", ts: iso, work_date: wd, raw_ref });
      else { const key = `${staffId}|${wd}`; (undirected.get(key) ?? undirected.set(key, []).get(key)!).push({ staff_id: staffId, ts: iso, work_date: wd, raw_ref }); }
    }
    // Rows with no Att State fall back to per-day in/out alternation.
    for (const list of undirected.values()) {
      list.sort((a, b) => a.ts.localeCompare(b.ts));
      list.forEach((e, i) => events.push({ ...e, direction: i % 2 === 0 ? "in" : "out" }));
    }

    if (body?.debug) return json(200, { ok: true, stage: "debug", ct, csvLen: csvText.length, nonBlank: csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12), headers: rows.length ? Object.keys(rows[0]) : [], rows: rows.length, matched: events.length, unmatched, badDate, sampleRow: rows[0] ?? null, sampleEvent: events[0] ?? null });

    // ---- connector-level dedup: skip punches already ingested (by raw_ref) so
    //      ongoing runs are cheap and big backfills make progress each call ----
    const allRefs = events.map((e) => e.raw_ref);
    const existing = new Set<string>();
    for (let i = 0; i < allRefs.length; i += 500) {
      const { data } = await db.from("punch_events").select("raw_ref").in("raw_ref", allRefs.slice(i, i + 500));
      for (const row of data ?? []) { const rr = (row as { raw_ref?: string }).raw_ref; if (rr) existing.add(rr); }
    }
    let fresh = events.filter((e) => !existing.has(e.raw_ref)).sort((a, b) => a.ts.localeCompare(b.ts));
    const totalNew = fresh.length;
    const CAP = Number(body?.cap) || 400; // keep one call under the edge-function timeout
    fresh = fresh.slice(0, CAP);

    // ---- feed ingest-punches (batched; chronological for cross-batch pairing) ----
    let accepted = 0, deduped = 0, opened = 0, closed = 0;
    const ingestErrs: unknown[] = [];
    const BATCH = Number(body?.batch) || 150;
    for (let i = 0; i < fresh.length; i += BATCH) {
      const chunk = fresh.slice(i, i + BATCH).map((e) => ({ staff_id: e.staff_id, direction: e.direction, ts: e.ts, work_date: e.work_date, raw_ref: e.raw_ref }));
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ingest-punches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "x-device-key": DEVICE_KEY },
        body: JSON.stringify({ events: chunk }),
      });
      const j = await r.json().catch(() => ({ error: `http ${r.status}` }));
      accepted += (j.accepted as number) || 0; deduped += (j.deduped as number) || 0;
      opened += (j.sessions_opened as number) || 0; closed += (j.sessions_closed as number) || 0;
      const je = (j as { errors?: { error?: string }[] }).errors;
      if (je?.length && ingestErrs.length < 3) ingestErrs.push(je[0]?.error);
      if ((j as { error?: unknown }).error && ingestErrs.length < 3) ingestErrs.push((j as { error?: unknown }).error);
    }
    return json(200, { ok: true, rows: rows.length, events: events.length, newEvents: totalNew, ingestedNow: fresh.length, remaining: Math.max(0, totalNew - fresh.length), ingest: { accepted, deduped, sessions_opened: opened, sessions_closed: closed, errs: ingestErrs } });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "unexpected" });
  }
});
