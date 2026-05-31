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
      throw new Error("Only owners can list users");
    }

    // Fetch all auth users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      throw new Error(`Failed to fetch users: ${authError.message}`);
    }

    // Fetch user roles
    const { data: rolesData, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (rolesError) {
      throw new Error(`Failed to fetch roles: ${rolesError.message}`);
    }

    // Fetch staff data for linking
    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, full_name, phone, email");

    // Create a map of auth users
    const authUsersMap = new Map(
      authData.users.map(u => [u.id, u])
    );

    // Create a map of staff by user_id
    const staffMap = new Map(staffData?.map(s => [s.user_id, s]) || []);

    // Combine data
    const combinedUsers = (rolesData || []).map(role => {
      const authUser = authUsersMap.get(role.user_id);
      const staff = staffMap.get(role.user_id);
      
      // Prefer staff data if exists, fall back to auth user_metadata
      const fullName = staff?.full_name || authUser?.user_metadata?.full_name || null;
      const phone = staff?.phone || authUser?.user_metadata?.phone || null;
      const email = staff?.email || authUser?.user_metadata?.email || authUser?.email || null;

      return {
        id: role.id,
        user_id: role.user_id,
        role: role.role,
        created_at: role.created_at,
        full_name: fullName,
        phone: phone,
        email: email,
        staff_id: staff?.id || null,
        staff_name: staff?.full_name || null,
        last_sign_in: authUser?.last_sign_in_at || null,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        users: combinedUsers,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error listing users:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
