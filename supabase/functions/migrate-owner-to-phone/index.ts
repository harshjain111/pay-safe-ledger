import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Convert phone to pseudo-email for Supabase auth
const phoneToEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `${cleanPhone}@phone.konnect2hospitality.internal`;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { owner_email, new_phone } = await req.json();

    if (!owner_email || !new_phone) {
      throw new Error("owner_email and new_phone are required");
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

    // Find the user by email
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }

    const ownerUser = users.users.find(u => u.email === owner_email);
    
    if (!ownerUser) {
      throw new Error(`User with email ${owner_email} not found`);
    }

    // Verify this user is an owner
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", ownerUser.id)
      .single();

    if (!roleData || roleData.role !== "owner") {
      throw new Error("This user is not an owner");
    }

    // Clean phone and create pseudo-email
    const cleanPhone = new_phone.replace(/[^0-9]/g, '');
    const newPseudoEmail = phoneToEmail(cleanPhone);

    // Update the user's email to the phone-based pseudo-email
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      ownerUser.id,
      {
        email: newPseudoEmail,
        email_confirm: true,
        user_metadata: {
          ...ownerUser.user_metadata,
          phone: cleanPhone,
          original_email: owner_email,
        },
      }
    );

    if (updateError) {
      throw new Error(`Failed to update user: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Account migrated successfully. You can now login with phone: ${cleanPhone}`,
        login_phone: cleanPhone,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error migrating owner:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
