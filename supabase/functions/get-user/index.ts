import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      throw new Error("user_id parameter is required");
    }

    // Get auth header to verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error("Missing authorization header");
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Create regular client to verify JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the caller using getClaims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      throw new Error("Unauthorized");
    }

    const callerId = claimsData.claims.sub;

    // Check caller's role using admin client
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    if (!roleData || roleData.role !== "owner") {
      throw new Error("Only owners can view user details");
    }

    // Fetch the target user from auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (authError) {
      throw new Error(`Failed to fetch user: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error("User not found");
    }

    // Fetch user role
    const { data: userRoleData } = await supabaseAdmin
      .from("user_roles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Fetch staff data if linked
    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, phone, email")
      .eq("user_id", userId)
      .single();

    // Combine data - prefer staff data, fall back to auth metadata
    const user = {
      user_id: userId,
      role: userRoleData?.role || null,
      full_name: staffData?.full_name || authData.user.user_metadata?.full_name || null,
      phone: staffData?.phone || authData.user.user_metadata?.phone || authData.user.phone || null,
      email: staffData?.email || authData.user.user_metadata?.email || authData.user.email || null,
      staff_id: staffData?.id || null,
      created_at: userRoleData?.created_at || authData.user.created_at,
    };

    return new Response(
      JSON.stringify({
        success: true,
        user,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error getting user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
