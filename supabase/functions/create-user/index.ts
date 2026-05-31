import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateUserRequest {
  phone: string;
  password: string;
  full_name: string;
  email?: string;
  role: "owner" | "admin" | "accountant" | "staff" | "ca";
  is_active: boolean;
  link_staff_id?: string; // Optional: link to existing staff record
}

// Convert phone to pseudo-email for Supabase auth
const phoneToEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `${cleanPhone}@phone.smokzy.internal`;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header to verify caller is owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
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

    // Create regular client to check caller permissions
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the caller is an owner
    const { data: { user: caller } } = await supabaseClient.auth.getUser();
    if (!caller) {
      throw new Error("Unauthorized");
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || roleData.role !== "owner") {
      throw new Error("Only owners can create users");
    }

    // Parse request body
    const body: CreateUserRequest = await req.json();
    const { phone, password, full_name, email, role, is_active, link_staff_id } = body;

    // Validate required fields
    if (!phone || !password || !full_name || !role) {
      throw new Error("Missing required fields");
    }

    // Clean and validate phone
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      throw new Error("Phone number must be at least 10 digits");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Convert phone to pseudo-email
    const pseudoEmail = phoneToEmail(cleanPhone);

    // Check if phone already exists (check auth by trying to find user)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const phoneExists = existingUsers?.users.some(u => 
      u.email === pseudoEmail || 
      u.user_metadata?.phone === cleanPhone
    );

    if (phoneExists) {
      throw new Error("A user with this phone number already exists");
    }

    // Create auth user with pseudo-email
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: pseudoEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone: cleanPhone,
        email: email || null,
      },
    });

    if (authError) {
      throw new Error(`Failed to create user: ${authError.message}`);
    }

    const userId = authUser.user.id;

    // Create user role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: role,
      });

    if (roleError) {
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Failed to assign role: ${roleError.message}`);
    }

    // If linking to existing staff record
    if (link_staff_id && role === 'staff') {
      const { error: staffError } = await supabaseAdmin
        .from("staff")
        .update({ user_id: userId })
        .eq("id", link_staff_id)
        .is("user_id", null); // Only update if not already linked

      if (staffError) {
        console.error("Staff link error:", staffError);
        // Don't rollback - user was created successfully, just log the issue
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        login_phone: cleanPhone,
        role: role,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error creating user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
