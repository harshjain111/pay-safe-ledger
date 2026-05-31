import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendWithRetry(
  url: string,
  payload: Record<string, unknown>,
  maxRetries = 3
): Promise<{ ok: boolean; status: number; body: string }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.text();

      if (res.ok) {
        return { ok: true, status: res.status, body };
      }

      // Don't retry 4xx (client errors) – only retry 5xx / network
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, body };
      }

      lastError = new Error(`HTTP ${res.status}: ${body}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    // Exponential back-off before next attempt
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  throw lastError ?? new Error("All retry attempts failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse incoming payload
    const {
      staff_id,
      staff_name,
      payout_type,
      amount,
      payment_mode,
      reference_number,
      payout_date,
    } = await req.json();

    // Validate required fields
    if (!staff_id || !payout_type || !amount || !reference_number) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const webhookUrl = Deno.env.get("FINANCIAL_CORE_WEBHOOK_URL");
    if (!webhookUrl) {
      console.error("FINANCIAL_CORE_WEBHOOK_URL secret is not configured");
      return new Response(
        JSON.stringify({ error: "Webhook URL not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload = {
      staff_id,
      staff_name: staff_name ?? "",
      payout_type,
      amount,
      payment_mode: payment_mode ?? "cash",
      reference_number,
      payout_date: payout_date ?? new Date().toISOString().slice(0, 10),
    };

    console.log("Sending payout webhook:", JSON.stringify(payload));

    const result = await sendWithRetry(webhookUrl, payload);

    console.log(
      `Webhook response – status: ${result.status}, ok: ${result.ok}`
    );

    return new Response(
      JSON.stringify({
        success: result.ok,
        status: result.status,
        message: result.ok
          ? "Payout synced to financial core"
          : "Financial core returned an error",
        details: result.body,
      }),
      {
        status: result.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("sync-to-financial error:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to sync after 3 attempts",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
