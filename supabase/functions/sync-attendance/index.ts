// On-demand attendance sync for logged-in users (login / refresh button).
//
// Deployed with verify_jwt = true, so the Supabase gateway authenticates the
// caller before we run — any signed-in user may trigger a sync, but the public
// can't. This function holds NO secret in the client: it calls the
// pull-etimetracklite connector server-to-server with the x-cron-secret from its
// own env, and bounds that call with a short timeout so a slow or unreachable
// device server never leaves the UI spinning.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CONNECTOR_TIMEOUT_MS = 18000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!CRON_SECRET) return json({ ok: false, reason: "sync not configured" }, 200);

  // Pull just the last few days (fast, idempotent). Bounded so a dead device
  // server (e.g. "No route to host") returns quickly instead of hanging.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECTOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pull-etimetracklite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, apikey: ANON },
      body: JSON.stringify({ backfill: true, days: 3 }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (data?.ok) {
      return json({ ok: true, upserted: data.upserted ?? 0, sessionsBuilt: data.sessionsBuilt ?? 0, rows: data.rows ?? 0 });
    }
    // Connector reached but couldn't pull (device offline, login failed, etc.).
    return json({ ok: false, reason: String(data?.error || data?.reason || "The attendance device is unreachable right now.") });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return json({ ok: false, reason: aborted ? "The attendance device is slow to respond — showing the latest saved data." : "Sync failed — showing the latest saved data." });
  } finally {
    clearTimeout(timer);
  }
});
