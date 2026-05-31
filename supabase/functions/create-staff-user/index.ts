import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateStaffUserRequest {
  phone: string;
  password: string;
  full_name: string;
  role: "staff" | "accountant" | "admin";
  staff_data: {
    employee_id: string;
    email?: string;
    department?: string;
    designation?: string;
    monthly_salary: number;
    date_of_joining: string;
    is_active: boolean;
  };
}

// Synthetic email domain for phone-number logins. Override via the PHONE_EMAIL_DOMAIN
// env var; must match the frontend (VITE_PHONE_EMAIL_DOMAIN) and existing auth.users rows.
const PHONE_EMAIL_DOMAIN = Deno.env.get("PHONE_EMAIL_DOMAIN") ?? "phone.payroll.internal";

// Convert phone to pseudo-email for Supabase auth
const phoneToEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `${cleanPhone}@${PHONE_EMAIL_DOMAIN}`;
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

    const callerRole = roleData?.role;
    
    // Allow owner, admin, and accountant to create staff users
    if (!callerRole || !['owner', 'admin', 'accountant'].includes(callerRole)) {
      throw new Error("Only owners, admins, or accountants can create staff users");
    }

    // Parse request body
    const body: CreateStaffUserRequest = await req.json();
    const { phone, password, full_name, role, staff_data } = body;

    // Validate required fields
    if (!phone || !password || !full_name || !role || !staff_data) {
      throw new Error("Missing required fields");
    }

    // Non-owners can only assign 'staff' role
    if (callerRole !== 'owner' && role !== 'staff') {
      throw new Error("Only owners can assign admin or accountant roles");
    }

    // Non-owners must set salary to 0
    if (callerRole !== 'owner') {
      staff_data.monthly_salary = 0;
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

    // Check if phone already exists
    const { data: existingStaff } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (existingStaff) {
      throw new Error("A staff member with this phone number already exists");
    }

    // Create auth user with pseudo-email
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: pseudoEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone: cleanPhone,
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

    // Create staff record
    const { data: staffRecord, error: staffError } = await supabaseAdmin
      .from("staff")
      .insert({
        user_id: userId,
        employee_id: staff_data.employee_id,
        full_name: full_name,
        email: staff_data.email || pseudoEmail,
        phone: cleanPhone,
        department: staff_data.department || null,
        designation: staff_data.designation || null,
        monthly_salary: staff_data.monthly_salary,
        date_of_joining: staff_data.date_of_joining,
        is_active: staff_data.is_active,
        created_by: caller.id,
      })
      .select()
      .single();

    if (staffError) {
      // Rollback: delete role and auth user
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Failed to create staff record: ${staffError.message}`);
    }

    // Create initial salary history
    await supabaseAdmin.from("salary_history").insert({
      staff_id: staffRecord.id,
      monthly_salary: staff_data.monthly_salary,
      effective_from: staff_data.date_of_joining,
      changed_by: caller.id,
      change_reason: "Initial salary on joining",
    });

    return new Response(
      JSON.stringify({
        success: true,
        staff: staffRecord,
        user_id: userId,
        login_phone: cleanPhone,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error creating staff user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
