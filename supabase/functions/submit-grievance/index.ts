// Anonymous grievance submission.
//
// This function DELIBERATELY records nothing about the caller. It is deployed
// with verify_jwt = false and is meant to be called with the public anon key
// (NOT a user session token), so no user identity ever reaches the server. It
// does not read the Authorization header, does not resolve auth.uid(), and does
// not log any identifying data. Attachments are written with the service role so
// the storage objects have no owner. The inserted row has no submitter column.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "audio/wav": "wav", "audio/x-m4a": "m4a",
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per attachment (after decode)

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64; // strip data: prefix
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 60) : "other";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";

    // Service-role client — writes with no user context.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    async function uploadMaybe(b64?: string, mime?: string): Promise<string | null> {
      if (!b64 || typeof b64 !== "string") return null;
      const bytes = decodeBase64(b64);
      if (bytes.length === 0) return null;
      if (bytes.length > MAX_BYTES) throw new Error("Attachment too large");
      const ext = (mime && EXT[mime]) || "bin";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await admin.storage.from("grievances").upload(path, bytes, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
      if (error) throw error;
      return path;
    }

    const photo_path = await uploadMaybe(body.photoBase64, body.photoType);
    const voice_path = await uploadMaybe(body.voiceBase64, body.voiceType);

    if (!message && !photo_path && !voice_path) {
      return json({ error: "Empty grievance — add text, a photo, or a voice note." }, 400);
    }

    const { error: insErr } = await admin.from("grievances").insert({
      category,
      message: message || null,
      photo_path,
      voice_path,
    });
    if (insErr) throw insErr;

    return json({ ok: true });
  } catch (e) {
    // Deliberately generic — never echo request contents back.
    console.error("submit-grievance failed:", e instanceof Error ? e.message : "unknown");
    return json({ error: "Could not submit. Please try again." }, 500);
  }
});
