// ============================================================================
// Direct push endpoint for biometric terminals (BioMax N-series / fk_device "R6")
//
//   Device settings:  server = this site's domain, port 443, SSL on,
//                     path AIData.aspx (vercel.json rewrites it here).
//
// The terminal POSTs one record per request, as JSON, with metadata in headers:
//   request_code: realtime_glog | realtime_enroll_data | receive_cmd | ...
//   dev_id:       the terminal's serial (matched to biometric_devices.serial)
//   trans_id:     echoed back in the reply
//   token:        fixed per terminal (pinned on first contact, then required)
// A punch body looks like:
//   {"doorMode":"open","inOut":"IN","ioMode":10,"time":"20261010175206",
//    "userId":"1","verifyMode":"Fp"}
//
// The terminal keeps re-sending the SAME queued record until it receives a
// reply carrying the header `response_code: OK`. Every record that we have
// safely stored (or deliberately set aside) is therefore acknowledged with OK;
// only a transient failure (database unreachable) or an unregistered terminal
// gets a non-OK reply, so the terminal keeps the record and retries.
//
// Each punch goes through public.apply_device_punch() — the SQL that turns a
// punch into attendance_sessions using the same gap rules as the imported
// punches — so it shows up in Attendance, Today's presence and payroll at once.
//
// Env (Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL                https://<project-id>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   service-role key (server only, never VITE_)
//   DEVICE_TZ_OFFSET            optional, the terminals' clock offset; +05:30
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Pure helpers (exported for src/lib/device-push.test.ts)
// ---------------------------------------------------------------------------

export interface DevicePunch {
  userId: string;
  /** Device clock, "YYYYMMDDHHmmss" */
  time: string;
  inOut?: string;
  verifyMode?: string;
}

/** "20261010175206" + "+05:30" -> Date for 2026-10-10T17:52:06+05:30. */
export function parseDeviceTime(t: string, offset = '+05:30'): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(t ?? '').trim());
  if (!m) return null;
  if (!/^[+-]\d{2}:\d{2}$/.test(offset)) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The JSON object in a push body. Tolerates a binary/length prefix or trailing
 *  bytes around it, which some firmware adds. */
export function extractJson(body: string): Record<string, unknown> | null {
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(body.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function toPunch(obj: Record<string, unknown> | null): DevicePunch | null {
  if (!obj) return null;
  const userId = obj.userId == null ? '' : String(obj.userId).trim();
  const time = obj.time == null ? '' : String(obj.time).trim();
  if (!time) return null;
  return {
    userId,
    time,
    inOut: obj.inOut == null ? undefined : String(obj.inOut),
    verifyMode: obj.verifyMode == null ? undefined : String(obj.verifyMode),
  };
}

export function punchMethod(verifyMode?: string): 'face' | 'biometric' {
  return (verifyMode ?? '').toLowerCase() === 'face' ? 'face' : 'biometric';
}

/** The headers the terminal treats as an acknowledgement. */
export function ackHeaders(transId: string, ok = true): Record<string, string> {
  return {
    response_code: ok ? 'OK' : 'ERROR',
    trans_id: transId,
    cmd_code: '',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return client;
}

function reply(transId: string, requestCode: string, ok: boolean, status = 200, detail?: string) {
  const body = JSON.stringify({ ret: requestCode, result: ok, count: ok ? 1 : 0, ...(detail ? { detail } : {}) });
  return new Response(body, { status, headers: ackHeaders(transId, ok) });
}

function log(event: string, data: Record<string, unknown>) {
  // Shows in Vercel → Project → Logs. No biometric data is ever logged.
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}

interface DeviceRow {
  id: string;
  is_active: boolean;
  push_token_hash: string | null;
  organization_id?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const h = request.headers;
  const requestCode = (h.get('request_code') ?? '').trim() || '(none)';
  const transId = (h.get('trans_id') ?? '').trim();
  const devId = (h.get('dev_id') ?? '').trim();
  const token = (h.get('token') ?? '').trim();
  const body = await request.text().catch(() => '');

  if (!devId) return reply(transId, requestCode, false, 400, 'missing dev_id');

  // ---- identify the terminal by its serial --------------------------------
  let device: DeviceRow | null;
  try {
    const { data, error } = await db()
      .from('biometric_devices')
      .select('*')
      .eq('serial', devId)
      .maybeSingle();
    if (error) throw error;
    device = data as DeviceRow | null;
  } catch (e) {
    log('db-error', { devId, requestCode, error: (e as Error).message });
    return reply(transId, requestCode, false, 503, 'temporarily unavailable');
  }
  if (!device) {
    // Not acknowledged: the terminal keeps the record and retries, so nothing
    // is lost once the device is registered in Settings → Hardware.
    log('unknown-device', { devId, requestCode });
    return reply(transId, requestCode, false, 403, 'device not registered');
  }
  if (!device.is_active) {
    log('disabled-device', { devId, requestCode });
    return reply(transId, requestCode, false, 403, 'device disabled');
  }

  // ---- token: pin on first contact, require afterwards -----------------------
  if (token) {
    const tokenHash = await sha256Hex(token);
    if (!device.push_token_hash) {
      await db().from('biometric_devices').update({ push_token_hash: tokenHash }).eq('id', device.id);
      log('token-pinned', { devId });
    } else if (device.push_token_hash !== tokenHash) {
      log('token-mismatch', { devId, requestCode });
      return reply(transId, requestCode, false, 403, 'token mismatch');
    }
  } else if (device.push_token_hash) {
    log('token-missing', { devId, requestCode });
    return reply(transId, requestCode, false, 403, 'token required');
  }

  // Every request counts as a heartbeat.
  await db()
    .from('biometric_devices')
    .update({ last_seen_at: new Date().toISOString(), status: 'online' })
    .eq('id', device.id);

  if (requestCode !== 'realtime_glog') {
    // Enrolment uploads (fingerprint/face templates), command polls, etc.:
    // acknowledged and discarded. Biometric templates are never stored.
    log('ack', { devId, requestCode, bytes: body.length });
    return reply(transId, requestCode, true);
  }

  // ---- a punch ---------------------------------------------------------------
  const punch = toPunch(extractJson(body));
  const at = punch ? parseDeviceTime(punch.time, process.env.DEVICE_TZ_OFFSET || '+05:30') : null;
  if (!punch || !at) {
    // Unreadable: acknowledge so it cannot block the queue, and log it.
    log('unreadable-punch', { devId, body: body.slice(0, 300) });
    return reply(transId, requestCode, true);
  }
  const method = punchMethod(punch.verifyMode);

  if (!punch.userId || !/^[A-Za-z0-9_.-]{1,64}$/.test(punch.userId)) {
    // Face/finger not matched to any user on the terminal itself.
    log('no-user', { devId, time: punch.time, verifyMode: punch.verifyMode });
    return reply(transId, requestCode, true);
  }

  try {
    // Resolve the person: the terminal's User ID is either the number stored
    // in staff.device_user_id or the employee code itself. Case-insensitive:
    // terminals keep "edl026" where the roster has "EDL026". ilike only narrows
    // the candidates (its "_" wildcard can over-match); the comparison decides.
    let staffQuery = db()
      .from('staff')
      .select('id, employee_id, device_user_id')
      .or(`device_user_id.ilike.${punch.userId},employee_id.ilike.${punch.userId}`);
    if (device.organization_id) staffQuery = staffQuery.eq('organization_id', device.organization_id);
    const { data: staffRows, error: staffErr } = await staffQuery;
    if (staffErr) throw staffErr;

    const uid = punch.userId.toUpperCase();
    const rows = (staffRows ?? []) as { id: string; employee_id: string | null; device_user_id: string | null }[];
    const staff =
      rows.find((r) => r.device_user_id?.toUpperCase() === uid) ??
      rows.find((r) => r.employee_id?.toUpperCase() === uid);

    if (!staff) {
      const { error } = await db()
        .from('device_unmatched_punches')
        .upsert(
          {
            device_id: device.id,
            organization_id: device.organization_id ?? null,
            device_user_id: punch.userId,
            ts: at.toISOString(),
            verify_mode: punch.verifyMode ?? null,
            raw: { inOut: punch.inOut ?? null, time: punch.time },
          },
          { onConflict: 'device_id,device_user_id,ts', ignoreDuplicates: true },
        );
      if (error) throw error;
      log('unmatched', { devId, userId: punch.userId, time: punch.time });
      return reply(transId, requestCode, true);
    }

    const { data: action, error } = await db().rpc('apply_device_punch', {
      _staff_id: staff.id,
      _device_id: device.id,
      _ts: at.toISOString(),
      _method: method,
      _raw_ref: `${devId}|${punch.time}|${punch.userId}|${punch.inOut ?? ''}`,
    });
    if (error) throw error;
    log('punch', { devId, userId: punch.userId, time: punch.time, action });
    return reply(transId, requestCode, true);
  } catch (e) {
    // Database trouble: not acknowledged, so the terminal retries the record.
    log('punch-error', { devId, userId: punch.userId, time: punch.time, error: (e as Error).message });
    return reply(transId, requestCode, false, 503, 'temporarily unavailable');
  }
}

/** Health check: open https://<site>/AIData.aspx in a browser. */
export function GET(): Response {
  return new Response(JSON.stringify({ ok: true, service: 'device-push' }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
