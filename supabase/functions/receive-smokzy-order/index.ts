import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("SMOKZY_ORDER_WEBHOOK_SECRET");

    if (!secret || secret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { customer_name, event_date_start, event_date_end, venue_name } = await req.json();

    // Validate required fields
    if (!event_date_start || !venue_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: event_date_start, venue_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse dates (extract date part from datetime strings)
    const eventDate = event_date_start.split("T")[0];
    const eventDateEnd = event_date_end ? event_date_end.split("T")[0] : null;

    const { data: event, error } = await supabase
      .from("events")
      .insert({
        event_date: eventDate,
        event_date_end: eventDateEnd,
        location: venue_name,
        client_name: customer_name || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Event insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create event", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created event ${event.id} from Smokzy order: ${venue_name} on ${eventDate}`);

    return new Response(
      JSON.stringify({ success: true, event_id: event.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("receive-smokzy-order error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
