import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user with their token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { password, dateFrom, dateTo, backupTimestamp } = await req.json();

    if (!password || !dateFrom || !dateTo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!backupTimestamp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Backup must be completed before clearing data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify password by attempting sign in
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: user.email!,
      password,
    });

    if (signInError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Incorrect password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is Owner
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || roleData?.role !== 'owner') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only owners can clear transaction data' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[clear-transaction-data] Owner ${user.email} initiating data clear: ${dateFrom} to ${dateTo}`);

    // Call the database function that bypasses immutability triggers
    const { data: deletedCounts, error: clearError } = await adminClient.rpc(
      'admin_clear_transaction_data',
      {
        _date_from: dateFrom,
        _date_to: dateTo,
        _owner_id: user.id,
      }
    );

    if (clearError) {
      console.error('Error clearing transaction data:', clearError);
      throw new Error(`Failed to clear transaction data: ${clearError.message}`);
    }

    console.log(`[clear-transaction-data] Successfully cleared data. Counts:`, deletedCounts);

    // Log audit entry
    const auditData = {
      table_name: 'SYSTEM',
      record_id: crypto.randomUUID(),
      action: 'CLEAR_TRANSACTIONS',
      performed_by: user.id,
      old_data: null,
      new_data: {
        action: 'CLEAR_TRANSACTIONS',
        owner_id: user.id,
        owner_email: user.email,
        date_from: dateFrom,
        date_to: dateTo,
        backup_taken: true,
        backup_timestamp: backupTimestamp,
        execution_timestamp: new Date().toISOString(),
        deleted_counts: deletedCounts,
      },
    };

    const { error: auditError } = await adminClient
      .from('audit_log')
      .insert(auditData);

    if (auditError) {
      console.error('Warning: Failed to log audit entry:', auditError);
      // Don't fail the operation for audit log error
    }

    return new Response(
      JSON.stringify({
        success: true,
        deletedCounts,
        message: `Successfully cleared ${deletedCounts?.total || 0} records`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[clear-transaction-data] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
