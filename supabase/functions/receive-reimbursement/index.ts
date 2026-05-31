import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("REIMBURSEMENT_WEBHOOK_SECRET");

    if (!secret || secret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const { phone, amount, order_id, order_date, customer_name, customer_address, delivery_date } =
      await req.json();

    // Validate required fields
    if (!phone || !amount || !order_id || !order_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone, amount, order_id, order_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up staff by phone
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id")
      .eq("phone", phone)
      .eq("is_active", true)
      .maybeSingle();

    if (staffError) {
      console.error("Staff lookup error:", staffError);
      return new Response(
        JSON.stringify({ error: "Failed to look up staff" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!staff) {
      return new Response(
        JSON.stringify({ error: `No active staff found with phone: ${phone}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build description
    const parts = [`Reimbursement for Order #${order_id}`];
    if (customer_name) parts.push(`Customer: ${customer_name}`);
    if (customer_address) parts.push(`Address: ${customer_address}`);
    if (delivery_date) parts.push(`Delivery: ${delivery_date}`);
    const description = parts.join(" | ");

    // Insert expense
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        staff_id: staff.id,
        amount,
        category: "logistics",
        description,
        expense_date: order_date,
        status: "pending",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (expenseError) {
      console.error("Expense insert error:", expenseError);
      return new Response(
        JSON.stringify({ error: "Failed to create expense", details: expenseError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created expense ${expense.id} for staff ${staff.id} from order ${order_id}`);

    return new Response(
      JSON.stringify({ success: true, expense_id: expense.id }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("receive-reimbursement error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
