// On-demand attendance sync for logged-in users.
//
// - light (default): pulls the last 3 days (login / refresh button). Fast.
// - full  (body { full: true }): "hard resync" — pulls a wide window (~5 weeks)
//   then rebuilds every biometric day cleanly (consolidate). Slower; for the
//   Hardware "Hard resync" button.
//
// verify_jwt = true — the gateway authenticates the caller. No secret in the
// client: this calls pull-etimetracklite server-to-server with the x-cron-secret
// from its own env, each call bounded by a timeout so a slow device never hangs.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!CRON_SECRET) return json({ ok: false, reason: "sync not configured" }, 200);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const full = body?.full === true;

  const call = async (payload: Record<string, unknown>, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/pull-etimetracklite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, apikey: ANON },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return await res.json().catch(() => ({} as Record<string, unknown>));
    } finally {
      clearTimeout(timer);
    }
  };

  const unreachable = (aborted: boolean) =>
    aborted ? "The attendance device is slow to respond — showing the latest saved data." : "The attendance device is unreachable right now.";

  try {
    if (full) {
      // Wide re-pull (~5 weeks) then a clean rebuild of every biometric day.
      const pull = await call({ backfill: true, days: 35 }, 90000);
      if (!pull?.ok) return json({ ok: false, full: true, reason: String(pull?.error || pull?.reason || unreachable(false)) });
      const cons = await call({ rebuildByGap: true }, 120000);
      return json({
        ok: !!cons?.ok,
        full: true,
        upserted: (pull as { upserted?: number }).upserted ?? 0,
        rebuilt: (cons as { result?: { after?: number } })?.result?.after ?? null,
        removed: (cons as { result?: { removed?: number } })?.result?.removed ?? null,
        reason: cons?.ok ? undefined : String((cons as { error?: string })?.error || "Rebuild did not finish"),
      });
    }

    const data = await call({ backfill: true, days: 3 }, 18000);
    if (data?.ok) return json({ ok: true, upserted: data.upserted ?? 0, sessionsBuilt: data.sessionsBuilt ?? 0, rows: data.rows ?? 0 });
    return json({ ok: false, reason: String(data?.error || data?.reason || unreachable(false)) });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return json({ ok: false, full, reason: unreachable(aborted) });
  }
});
