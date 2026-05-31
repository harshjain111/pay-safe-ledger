import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error("Missing authorization header");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the caller
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Get users with owner, admin, or accountant roles
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["owner", "admin", "accountant"]);

    if (roleError) throw roleError;

    if (!roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ success: true, users: [] }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userIds = [...new Set(roleData.map(r => r.user_id))];

    // Fetch auth users to get their metadata (names)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) throw authError;

    // Fetch staff data for linked users
    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("user_id, full_name, email")
      .in("user_id", userIds);

    const staffMap = new Map(staffData?.map(s => [s.user_id, s]) || []);
    const authMap = new Map(authData.users.map(u => [u.id, u]));

    const users = userIds.map(userId => {
      const roles = roleData.filter(r => r.user_id === userId);
      const staff = staffMap.get(userId);
      const authUser = authMap.get(userId);

      // Priority: staff.full_name > auth.user_metadata.full_name > email prefix
      const name = staff?.full_name 
        || authUser?.user_metadata?.full_name 
        || authUser?.email?.split('@')[0] 
        || 'Unknown';

      let displayRole = 'User';
      if (roles.some(r => r.role === 'owner')) displayRole = 'Owner';
      else if (roles.some(r => r.role === 'admin')) displayRole = 'Admin';
      else if (roles.some(r => r.role === 'accountant')) displayRole = 'Accountant';

      return {
        id: userId,
        name,
        role: displayRole,
        email: staff?.email || authUser?.email || '',
      };
    });

    return new Response(
      JSON.stringify({ success: true, users }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
