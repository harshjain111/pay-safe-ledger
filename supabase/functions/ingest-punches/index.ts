// ============================================================================
// POST /functions/v1/ingest-punches
//
// Accepts punch events from a registered biometric/face device or an on-prem
// agent and feeds them into the SAME attendance pipeline the in-app check-in
// widget uses: punches are normalised into `attendance_sessions` rows, which is
// exactly what settlements read. Nothing is forked.
//
// Auth:    header `x-device-key: <plaintext device key>` (hashed + matched
//          against biometric_devices.api_key_hash). No Supabase user JWT is
//          required (config.toml sets verify_jwt = false); send the project
//          anon key as the `apikey` header so the gateway routes the request.
//
// Idempotency: each punch is inserted into `punch_events` with a UNIQUE
//          (device_id, ts, staff_id) constraint, so the exact same physical
//          punch lands once even if the device retries. The reducer additionally
//          collapses logical duplicates (a second IN while already checked in).
//
// Body:    { "events": [ PunchIn, ... ] }   (also accepts a single { "event" }
//          or a bare event object)
//   PunchIn = {
//     staff_id?: string,        // our staff UUID, OR
//     employee_id?: string,     // resolves to staff by employee_id
//     direction: "in" | "out",
//     ts: string,               // ISO 8601 instant of the punch
//     method?: "biometric" | "face",   // defaults to the device type
//     raw_ref?: string,         // the device's own event id (for audit)
//     work_date?: string,       // YYYY-MM-DD; defaults to the IST date of ts
//     geo?: { lat?: number, lng?: number, accuracy?: number }
//   }
//
// Response: { ok, device_id, received, accepted, deduped, sessions_opened,
//             sessions_closed, skipped[], errors[] }
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { reducePunches, type OpenSession, type PunchInput } from "../_shared/punch-normalize.ts";
import { sha256Hex } from "../_shared/device-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** YYYY-MM-DD for an ISO instant in Asia/Kolkata (+05:30, no DST). */
function istWorkDate(tsIso: string): string {
  const ist = new Date(new Date(tsIso).getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Flag a checkout as "late" when its work_date is more than a day old (mirrors
 *  the in-app checkOut rule). Purely a UI hint; does not affect pay. */
function isLateCheckout(workDate: string): boolean {
  const cutoff = new Date();
  cutoff.setHours(6, 0, 0, 0);
  const wd = new Date(workDate + "T00:00:00");
  const dayDiff = Math.floor((cutoff.getTime() - wd.getTime()) / 86_400_000);
  return dayDiff > 1;
}

interface Accepted {
  punchId: string;
  staffId: string;
  direction: "in" | "out";
  ts: string;
  workDate: string;
  method: string;
  geo: { lat?: number; lng?: number; accuracy?: number } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const deviceKey = req.headers.get("x-device-key") ?? "";
    if (!deviceKey) return json(401, { error: "Missing x-device-key header" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ---- authenticate the device by API-key hash --------------------------
    const keyHash = await sha256Hex(deviceKey);
    const { data: device, error: devErr } = await admin
      .from("biometric_devices")
      .select("id, outlet_id, type, is_active")
      .eq("api_key_hash", keyHash)
      .maybeSingle();
    if (devErr) return json(500, { error: devErr.message });
    if (!device) return json(401, { error: "Invalid device key" });
    if (!device.is_active) return json(403, { error: "Device is disabled" });

    const defaultMethod = device.type === "face" ? "face" : "biometric";

    // ---- parse body -------------------------------------------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const b = body as Record<string, unknown>;
    const rawEvents: Record<string, unknown>[] = Array.isArray(b?.events)
      ? (b.events as Record<string, unknown>[])
      : b?.event
      ? [b.event as Record<string, unknown>]
      : b
      ? [b]
      : [];
    if (rawEvents.length === 0) return json(400, { error: "No events provided" });

    const errors: { raw_ref?: string; error: string }[] = [];

    // ---- resolve staff (by id and/or employee_id) -------------------------
    const idSet = new Set<string>();
    const empSet = new Set<string>();
    for (const e of rawEvents) {
      if (typeof e.staff_id === "string") idSet.add(e.staff_id);
      else if (typeof e.employee_id === "string") empSet.add(e.employee_id);
    }

    const staffMeta = new Map<string, { user_id: string | null }>();
    const empToId = new Map<string, string>();
    if (idSet.size > 0) {
      const { data } = await admin.from("staff").select("id, user_id").in("id", [...idSet]);
      for (const s of data ?? []) staffMeta.set(s.id, { user_id: s.user_id ?? null });
    }
    if (empSet.size > 0) {
      const { data } = await admin
        .from("staff")
        .select("id, user_id, employee_id")
        .in("employee_id", [...empSet]);
      for (const s of data ?? []) {
        staffMeta.set(s.id, { user_id: s.user_id ?? null });
        if (s.employee_id) empToId.set(s.employee_id, s.id);
      }
    }

    // ---- idempotent insert into punch_events ------------------------------
    let deduped = 0;
    const accepted: Accepted[] = [];

    for (const e of rawEvents) {
      const rawRef = typeof e.raw_ref === "string" ? e.raw_ref : undefined;
      const direction = e.direction === "out" ? "out" : e.direction === "in" ? "in" : null;
      const ts = typeof e.ts === "string" ? e.ts : null;
      if (!direction) {
        errors.push({ raw_ref: rawRef, error: "direction must be 'in' or 'out'" });
        continue;
      }
      if (!ts || Number.isNaN(new Date(ts).getTime())) {
        errors.push({ raw_ref: rawRef, error: "ts must be a valid ISO timestamp" });
        continue;
      }

      const staffId =
        typeof e.staff_id === "string"
          ? e.staff_id
          : typeof e.employee_id === "string"
          ? empToId.get(e.employee_id)
          : undefined;
      if (!staffId || !staffMeta.has(staffId)) {
        errors.push({ raw_ref: rawRef, error: "Unknown staff (staff_id / employee_id)" });
        continue;
      }

      const method = e.method === "face" || e.method === "biometric" ? e.method : defaultMethod;
      const geo = (e.geo && typeof e.geo === "object" ? e.geo : null) as Accepted["geo"];
      const workDate = typeof e.work_date === "string" ? e.work_date : istWorkDate(ts);

      const punchId = crypto.randomUUID();
      const { error: insErr } = await admin.from("punch_events").insert({
        id: punchId,
        staff_id: staffId,
        device_id: device.id,
        ts,
        direction,
        method,
        raw_ref: rawRef ?? null,
        outlet_id: device.outlet_id ?? null,
        geo: geo ?? null,
      });
      if (insErr) {
        // 23505 = unique_violation on (device_id, ts, staff_id): already ingested.
        if ((insErr as { code?: string }).code === "23505") deduped++;
        else errors.push({ raw_ref: rawRef, error: insErr.message });
        continue;
      }

      accepted.push({ punchId, staffId, direction, ts, workDate, method, geo });
    }

    // ---- seed each staff's current open session ---------------------------
    const staffIds = [...new Set(accepted.map((a) => a.staffId))];
    const seed: Record<string, OpenSession | null> = {};
    for (const id of staffIds) seed[id] = null;
    if (staffIds.length > 0) {
      const { data: openRows } = await admin
        .from("attendance_sessions")
        .select("id, staff_id, check_in_at, status")
        .in("staff_id", staffIds)
        .in("status", ["active", "on_break"]);
      for (const row of openRows ?? []) {
        if (!row.staff_id) continue;
        const ex = seed[row.staff_id];
        if (!ex || new Date(row.check_in_at) > new Date(ex.check_in_at)) {
          seed[row.staff_id] = {
            id: row.id,
            check_in_at: row.check_in_at,
            status: row.status as OpenSession["status"],
          };
        }
      }
    }

    // ---- normalise into attendance_sessions -------------------------------
    const inputs: PunchInput[] = accepted.map((a) => ({
      staffId: a.staffId,
      direction: a.direction,
      ts: a.ts,
      workDate: a.workDate,
    }));
    const plan = reducePunches(inputs, seed);

    const tempToReal: Record<string, string> = {};
    const skipped: { staff_id: string; reason: string }[] = [];
    let opened = 0;
    let closed = 0;

    for (const { index, action } of plan) {
      const a = accepted[index];
      if (action.kind === "open") {
        const { data: ins, error } = await admin
          .from("attendance_sessions")
          .insert({
            staff_id: action.staffId,
            user_id: staffMeta.get(action.staffId)?.user_id ?? null,
            work_date: action.work_date,
            check_in_at: action.check_in_at,
            check_in_photo_url: "biometric",
            check_in_lat: a.geo?.lat ?? null,
            check_in_lng: a.geo?.lng ?? null,
            check_in_accuracy: a.geo?.accuracy ?? null,
            status: "active",
            source: a.method,
          })
          .select("id")
          .single();
        if (error) {
          errors.push({ raw_ref: a.punchId, error: `open: ${error.message}` });
          continue;
        }
        tempToReal[action.tempId] = ins.id;
        await admin.from("punch_events").update({ session_id: ins.id }).eq("id", a.punchId);
        opened++;
      } else if (action.kind === "close") {
        const realId = action.session_id.startsWith("pending-")
          ? tempToReal[action.session_id]
          : action.session_id;
        if (!realId) {
          errors.push({ raw_ref: a.punchId, error: "close: unresolved session" });
          continue;
        }
        const { error } = await admin
          .from("attendance_sessions")
          .update({
            status: "completed",
            check_out_at: action.check_out_at,
            worked_minutes: action.worked_minutes,
            check_out_lat: a.geo?.lat ?? null,
            check_out_lng: a.geo?.lng ?? null,
            check_out_accuracy: a.geo?.accuracy ?? null,
            late_checkout: isLateCheckout(a.workDate),
          })
          .eq("id", realId);
        if (error) {
          errors.push({ raw_ref: a.punchId, error: `close: ${error.message}` });
          continue;
        }
        await admin.from("punch_events").update({ session_id: realId }).eq("id", a.punchId);
        closed++;
      } else {
        skipped.push({ staff_id: action.staffId, reason: action.reason });
      }
    }

    // ---- mark the device seen ---------------------------------------------
    await admin
      .from("biometric_devices")
      .update({ last_seen_at: new Date().toISOString(), status: "online" })
      .eq("id", device.id);

    return json(200, {
      ok: true,
      device_id: device.id,
      received: rawEvents.length,
      accepted: accepted.length,
      deduped,
      sessions_opened: opened,
      sessions_closed: closed,
      skipped,
      errors,
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
