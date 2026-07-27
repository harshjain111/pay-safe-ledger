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
    const wholeMonth = !!(body?.backfill || body?.employees || body?.importStaff) || yr !== now.getUTCFullYear() || mo !== now.getUTCMonth() + 1;
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

      type P = { ts: string; dir: "in" | "out"; wd: string };
      const byStaff = new Map<string, P[]>();
      let unmatchedB = 0;
      for (const r of rows) {
        const sid = codeToId.get(col(r, "UserId", "Employee Code In Device")); if (!sid) { unmatchedB++; continue; }
        const iso = logDateToIso(col(r, "Log Date")); if (!iso) continue;
        const ist = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
        const wd = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
        const dir: "in" | "out" = col(r, "Att State").toLowerCase().includes("out") ? "out" : "in";
        (byStaff.get(sid) ?? byStaff.set(sid, []).get(sid)!).push({ ts: iso, dir, wd });
      }

      const mk = (sid: string, i: P, o: P | null) => ({
        staff_id: sid, user_id: idToUser.get(sid) ?? null, work_date: i.wd, check_in_at: i.ts,
        check_out_at: o?.ts ?? null,
        worked_minutes: o ? Math.max(0, Math.round((new Date(o.ts).getTime() - new Date(i.ts).getTime()) / 60000)) : null,
        status: o ? "completed" : "active", source: "biometric", check_in_photo_url: "biometric",
      });
      const sessions: ReturnType<typeof mk>[] = [];
      for (const [sid, list] of byStaff) {
        list.sort((a, b) => a.ts.localeCompare(b.ts));
        let open: P | null = null;
        for (const p of list) {
          if (p.dir === "in") { if (open) sessions.push(mk(sid, open, null)); open = p; }
          else if (open) { sessions.push(mk(sid, open, p)); open = null; }
        }
        if (open) sessions.push(mk(sid, open, null));
      }

      let up = 0; const errB: string[] = [];
      for (let i = 0; i < sessions.length; i += 500) {
        const { error } = await db.from("attendance_sessions").upsert(sessions.slice(i, i + 500), { onConflict: "staff_id,check_in_at", ignoreDuplicates: false });
        if (error) { if (errB.length < 3) errB.push(error.message); } else up += Math.min(500, sessions.length - i);
      }
      return json(200, { ok: true, month: `${yr}-${pad(mo)}`, rows: rows.length, staffWithPunches: byStaff.size, sessionsBuilt: sessions.length, upserted: up, unmatched: unmatchedB, errs: errB });
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
