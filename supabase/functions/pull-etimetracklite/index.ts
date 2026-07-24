// ============================================================================
// pull-etimetracklite — scheduled connector.
//
// Pulls attendance punches from the eTimeTrackLite (eSSL) web console and feeds
// them into the existing ingest-punches pipeline (dedup + normalize untouched).
// Runs on cron; guarded by CRON_SECRET. Replaces a separate connector app.
//
// Flow: login (ASP.NET WebForms) -> fetch "Device Logs" CSV for the last ~2 days
// -> resolve staff by matching either device/HR code against staff.employee_id
// -> derive in/out by per-staff per-day alternation -> POST to ingest-punches.
//
// Modes (POST body): { "discover": true } dumps the report form; {} = pull.
// Secrets: ETIMETRACK_BASE_URL/USER/PASS, ETIMETRACK_DEVICE_KEY, CRON_SECRET.
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const BASE = (Deno.env.get("ETIMETRACK_BASE_URL") ?? "").replace(/\/+$/, "");
const USER = Deno.env.get("ETIMETRACK_USER") ?? "";
const PASS = Deno.env.get("ETIMETRACK_PASS") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const REPORT_PATH = "/iclock/Reports/CustomReport.aspx?Id=2";
const LOGIN_PATH = "/iclock/Default.aspx";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Jar {
  private c = new Map<string, string>();
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
  absorb(res: Response) {
    const list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const sc of list) {
      const first = sc.split(";")[0];
      const i = first.indexOf("=");
      if (i > 0) this.c.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
    }
  }
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseInputs(html: string) {
  const meta: { name: string; type: string; value: string; checked: boolean }[] = [];
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const name = (/\bname\s*=\s*"([^"]*)"/i.exec(tag) || [])[1];
    if (!name) continue;
    const type = ((/\btype\s*=\s*"([^"]*)"/i.exec(tag) || [])[1] || "text").toLowerCase();
    const value = decodeEntities((/\bvalue\s*=\s*"([^"]*)"/i.exec(tag) || [])[1] || "");
    meta.push({ name, type, value, checked: /\bchecked\b/i.test(tag) });
  }
  return meta;
}

/** One request: timeout + retry/backoff (source server 503s under load). */
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
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

/** Follows ASP.NET redirects (302 -> GET) carrying the cookie jar. */
async function get(url: string, init: RequestInit, jar: Jar): Promise<{ res: Response; finalUrl: string }> {
  let target = url, cur = init;
  for (let hop = 0; hop < 6; hop++) {
    const res = await once(target, cur, jar);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: target };
      target = new URL(loc, target).toString();
      cur = { method: "GET" };
      continue;
    }
    return { res, finalUrl: target };
  }
  throw new Error("too many redirects");
}

async function login(jar: Jar): Promise<void> {
  const page = await (await get(`${BASE}${LOGIN_PATH}`, { method: "GET" }, jar)).res.text();
  const form = new URLSearchParams();
  for (const f of parseInputs(page)) {
    if (/^(__EVENTTARGET|__EVENTARGUMENT|__VIEWSTATE|__VIEWSTATEGENERATOR)$/.test(f.name) || f.name === "StaffloginDialog$txtKey") {
      form.set(f.name, f.value);
    }
  }
  form.set("StaffloginDialog$txt_LoginName", USER);
  form.set("StaffloginDialog$Txt_Password", PASS);
  form.set("StaffloginDialog$Btn_Ok", "Login");
  const { res } = await get(`${BASE}${LOGIN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }, jar);
  const body = res.status === 200 ? await res.text() : "";
  if (res.status === 200 && /Txt_Password/i.test(body)) throw new Error("Login failed (still on login page)");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!CRON_SECRET || (req.headers.get("x-cron-secret") ?? "") !== CRON_SECRET) return json(401, { error: "Unauthorized" });
    if (!BASE || !USER || !PASS) return json(500, { error: "Missing ETIMETRACK_* secrets" });

    const body = await req.json().catch(() => ({}));
    const jar = new Jar();
    await login(jar);

    if (body?.discover) {
      const { res, finalUrl } = await get(`${BASE}${REPORT_PATH}`, { method: "GET" }, jar);
      const html = await res.text();
      const inputs = parseInputs(html)
        .filter((f) => !/^(__VIEWSTATE|__VIEWSTATEGENERATOR|__EVENTVALIDATION)$/.test(f.name))
        .map((f) => ({ name: f.name, type: f.type, value: f.value.slice(0, 30), checked: f.checked }));
      const selects = [...html.matchAll(/<select\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*>/gi)].map((m) => m[1]);
      const buttons = [...html.matchAll(/<(?:input|a)\b[^>]*>/gi)]
        .map((m) => m[0]).filter((t) => /type\s*=\s*"(submit|button)"|doPostBack/i.test(t))
        .map((t) => ({ name: (/\bname\s*=\s*"([^"]*)"/i.exec(t) || [])[1], value: (/\bvalue\s*=\s*"([^"]*)"/i.exec(t) || [])[1], href: (/\bhref\s*=\s*"([^"]*)"/i.exec(t) || [])[1] }))
        .slice(0, 20);
      return json(200, {
        ok: true, status: res.status, finalUrl,
        htmlLength: html.length, onLoginPage: /Txt_Password/i.test(html),
        title: (/<title>([^<]*)<\/title>/i.exec(html) || [])[1],
        frames: [...html.matchAll(/<(?:iframe|frame)\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).slice(0, 10),
        htmlHead: html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/\s+/g, " ").slice(0, 900),
        inputs, selects, buttons,
      });
    }

    return json(200, { ok: true, note: "Login OK. Pull finalized after discover confirms the report field names." });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "unexpected" });
  }
});
