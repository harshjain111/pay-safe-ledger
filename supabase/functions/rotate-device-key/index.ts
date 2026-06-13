// ============================================================================
// POST /functions/v1/rotate-device-key
//
// Provisions (or regenerates) the API key for a biometric device. Owner/admin
// only. The plaintext key is returned ONCE in the response; only its SHA-256
// hash is persisted (biometric_devices.api_key_hash). Regenerating immediately
// invalidates the previous key.
//
// Body:    { "device_id": "<uuid>" }
// Response: { ok, device_id, api_key, api_key_prefix }
// ============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { generateDeviceKey, sha256Hex, keyDisplayPrefix } from "../_shared/device-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization header" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const caller = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" });

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isOwnerOrAdmin = (roles ?? []).some((r) => r.role === "owner" || r.role === "admin");
    if (!isOwnerOrAdmin) return json(403, { error: "Only owners and admins can rotate device keys" });

    const body = (await req.json().catch(() => ({}))) as { device_id?: string };
    if (!body.device_id) return json(400, { error: "device_id is required" });

    // Ensure the device exists before issuing a key.
    const { data: device, error: devErr } = await admin
      .from("biometric_devices")
      .select("id")
      .eq("id", body.device_id)
      .maybeSingle();
    if (devErr) return json(500, { error: devErr.message });
    if (!device) return json(404, { error: "Device not found" });

    const apiKey = generateDeviceKey();
    const apiKeyHash = await sha256Hex(apiKey);
    const apiKeyPrefix = keyDisplayPrefix(apiKey);

    const { error: updErr } = await admin
      .from("biometric_devices")
      .update({ api_key_hash: apiKeyHash, api_key_prefix: apiKeyPrefix })
      .eq("id", device.id);
    if (updErr) return json(500, { error: updErr.message });

    return json(200, {
      ok: true,
      device_id: device.id,
      api_key: apiKey,
      api_key_prefix: apiKeyPrefix,
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
