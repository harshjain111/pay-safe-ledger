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
const REPORT_PATH = "/iclock/Reports/CustomReport.aspx?Id=2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Jar {
  private c = new Map<string, string>();
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
  absorb(res: Response) {
    const list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
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

async function get(url: string, init: RequestInit, jar: Jar): Promise<{ res: Response; finalUrl: string }> {
  let target = url, cur = init;
  for (let hop = 0; hop < 6; hop++) {
    const res = await once(target, cur, jar);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: target };
      target = new URL(loc, target).toString(); cur = { method: "GET" }; continue;
    }
    return { res, finalUrl: target };
  }
  throw new Error("too many redirects");
}

async function login(jar: Jar): Promise<void> {
  const page = await (await get(`${BASE}${LOGIN_PATH}`, { method: "GET" }, jar)).res.text();
  const form = new URLSearchParams();
  for (const f of parseInputs(page)) {
    if (/^(__EVENTTARGET|__EVENTARGUMENT|__VIEWSTATE|__VIEWSTATEGENERATOR)$/.test(f.name) || f.name === "StaffloginDialog$txtKey") form.set(f.name, f.value);
  }
  form.set("StaffloginDialog$txt_LoginName", USER);
  form.set("StaffloginDialog$Txt_Password", PASS);
  form.set("StaffloginDialog$Btn_Ok", "Login");
  const { res } = await get(`${BASE}${LOGIN_PATH}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }, jar);
  const body = res.status === 200 ? await res.text() : "";
  if (res.status === 200 && /Txt_Password/i.test(body)) throw new Error("Login failed (still on login page)");
  // Establish the session on the home page (some eSSL builds gate reports otherwise).
  await get(`${BASE}${HOME_PATH}`, { method: "GET" }, jar).catch(() => {});
}

// ---- dates -----------------------------------------------------------------
function istNow(): Date { return new Date(Date.now() + 5.5 * 3600_000); }
function fmtDate(d: Date, sample: string): string {
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0"), yyyy = d.getUTCFullYear();
  if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return `${yyyy}-${mm}-${dd}`;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(sample)) return `${mm}/${dd}/${yyyy}`;
  return `${dd}-${mm}-${yyyy}`; // default dd-MM-yyyy (eSSL India)
}
/** eSSL LogDate (IST local) -> UTC ISO instant. Handles dd-MM-yyyy / yyyy-MM-dd / MM/dd/yyyy + HH:mm(:ss). */
function logDateToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if (+m[1] > 12) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else { d = +m[1]; mo = +m[2]; y = +m[3]; } // dd-MM-yyyy assumed for ambiguous
  const utc = Date.UTC(y, mo - 1, d, +m[4], +m[5], +(m[6] || 0)) - 5.5 * 3600_000; // IST -> UTC
  return new Date(utc).toISOString();
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const split = (l: string) => { const o: string[] = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o.map((x) => x.trim()); };
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
    await login(jar);

    // ---- fetch the report form + submit it for the CSV ----------------------
    const { res: gres, finalUrl } = await get(`${BASE}${REPORT_PATH}`, { method: "GET" }, jar);
    const formHtml = await gres.text();
    if (/Txt_Password/i.test(formHtml) || /LogOut\.aspx/i.test(finalUrl)) {
      return json(200, { ok: false, stage: "report-page", reason: "session bounced to login/logout", finalUrl, hint: "eval server single-session — ensure no human is logged in as this eSSL user, or use a dedicated connector user." });
    }

    const { params, dateFields, submits } = serializeForm(formHtml);
    if (body?.discover) {
      return json(200, { ok: true, finalUrl, dateFields, submits, htmlLen: formHtml.length, sampleFields: [...params.keys()].slice(0, 40) });
    }

    // date range: last 2 days -> today (IST), matching the field's own format
    const to = istNow(), from = new Date(to.getTime() - 2 * 86400_000);
    const sample = dateFields.length ? (params.get(dateFields[0]) || "") : "";
    for (const f of dateFields) params.set(f, /to|end/i.test(f) ? fmtDate(to, sample) : fmtDate(from, sample));
    // click the export/download button (prefer CSV/export over view)
    const btn = submits.find((b) => b.name && /export|csv|excel|download/i.test(b.value + b.name)) || submits.find((b) => b.name && /view|show|generate|report|search|go|ok/i.test(b.value + b.name)) || submits.find((b) => b.name);
    if (btn?.name) params.set(btn.name, btn.value || "");

    const csvRes = await get(`${BASE}${REPORT_PATH}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() }, jar);
    const csvText = await csvRes.res.text();
    const ct = csvRes.res.headers.get("content-type") || "";
    const looksCsv = /Employee Code/i.test(csvText.slice(0, 300)) || /text\/csv|octet-stream|application\/vnd/i.test(ct);
    if (!looksCsv) {
      return json(200, { ok: false, stage: "report-post", reason: "response was not the CSV", contentType: ct, dateFields, clickedButton: btn?.name, head: csvText.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/\s+/g, " ").slice(0, 500) });
    }

    // ---- map rows -> events -------------------------------------------------
    const rows = parseCsv(csvText);
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.90.1");
    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: staff } = await db.from("staff").select("id, employee_id");
    const byCode = new Map<string, string>();
    for (const s of staff ?? []) if (s.employee_id) byCode.set(String(s.employee_id).trim(), s.id);

    type Ev = { staff_id: string; ts: string; work_date: string; raw_ref: string };
    const perStaffDay = new Map<string, Ev[]>();
    let unmatched = 0, badDate = 0;
    for (const r of rows) {
      const staffId = byCode.get((r["Employee Code In Device"] || "").trim()) || byCode.get((r["Employee Code"] || "").trim());
      if (!staffId) { unmatched++; continue; }
      const iso = logDateToIso(r["LogDate"] || "");
      if (!iso) { badDate++; continue; }
      const ist = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
      const wd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
      const key = `${staffId}|${wd}`;
      (perStaffDay.get(key) ?? perStaffDay.set(key, []).get(key)!).push({ staff_id: staffId, ts: iso, work_date: wd, raw_ref: `etl:${r["Employee Code In Device"]}:${r["LogDate"]}` });
    }

    // derive in/out by per-staff per-day alternation (1st=in, 2nd=out, ...)
    const events: (Ev & { direction: "in" | "out" })[] = [];
    for (const list of perStaffDay.values()) {
      list.sort((a, b) => a.ts.localeCompare(b.ts));
      list.forEach((e, i) => events.push({ ...e, direction: i % 2 === 0 ? "in" : "out" }));
    }

    if (body?.debug) return json(200, { ok: true, stage: "debug", rows: rows.length, matched: events.length, unmatched, badDate, sampleEvent: events[0] ?? null, sampleRow: rows[0] ?? null });

    // ---- feed ingest-punches ------------------------------------------------
    let ingest: unknown = null;
    if (events.length) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ingest-punches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "x-device-key": DEVICE_KEY },
        body: JSON.stringify({ events: events.map((e) => ({ staff_id: e.staff_id, direction: e.direction, ts: e.ts, work_date: e.work_date, raw_ref: e.raw_ref })) }),
      });
      ingest = await r.json().catch(() => ({ status: r.status }));
    }
    return json(200, { ok: true, rows: rows.length, events: events.length, unmatched, badDate, ingest });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "unexpected" });
  }
});
