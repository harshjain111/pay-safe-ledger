import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ============================================================================
// Leave jobs cron — monthly/yearly auto-allocation + carry-forward/encashment.
// Mirrors the tested pure logic in src/lib/leave-allocation.ts. Invoked on a
// schedule (see docs/LEAVES_HOLIDAYS.md) with { action, period }.
//   action 'allocate'      -> credit no_of_auto_allocation_leaves to holders
//   action 'carry_forward' -> cap carried balance, encash/forfeit the rest
//   period 'MONTH' | 'YEAR'
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // Optional shared-secret guard for the scheduler.
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, period } = await req.json() as { action: 'allocate' | 'carry_forward'; period: 'MONTH' | 'YEAR' };
    if (!['allocate', 'carry_forward'].includes(action) || !['MONTH', 'YEAR'].includes(period)) {
      return new Response(JSON.stringify({ error: 'Bad action/period' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } });

    const now = new Date();
    const periodLabel = period === 'MONTH' ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}` : String(now.getUTCFullYear());
    // Period end = yesterday (the job runs at the start of the new period).
    const periodEnd = new Date(now); periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);
    const periodEndStr = periodEnd.toISOString().slice(0, 10);

    const { data: types, error: tErr } = await admin.from('leave_types').select('*').eq('is_active', true);
    if (tErr) throw tErr;

    let touched = 0, encashments = 0;
    for (const t of types ?? []) {
      if (action === 'allocate') {
        if (t.auto_allocation_period !== period) continue;
        const qty = Number(t.no_of_auto_allocation_leaves) || 0;
        if (qty <= 0) continue;
        const { data: bals } = await admin.from('employee_leave_balance').select('id, balance').eq('leave_type_id', t.id);
        for (const b of bals ?? []) { await admin.from('employee_leave_balance').update({ balance: round2(Number(b.balance) + qty) }).eq('id', b.id); touched++; }
      } else {
        if (t.carry_forward_period !== period) continue;
        const cap = Math.max(0, Number(t.carry_forward_leaves) || 0);
        const { data: bals } = await admin.from('employee_leave_balance').select('id, staff_id, balance').eq('leave_type_id', t.id);
        for (const b of bals ?? []) {
          const bal = Math.max(0, Number(b.balance) || 0);
          const carried = Math.min(bal, cap);
          const leftover = bal - carried;
          let encashed = 0;
          if (t.encashment_enabled) { const lim = Math.max(0, Number(t.encashment_limit ?? 0)); encashed = Math.max(0, Math.min(leftover, bal - lim)); }
          await admin.from('employee_leave_balance').update({ balance: round2(carried) }).eq('id', b.id);
          touched++;
          if (encashed > 0.001) {
            await admin.from('leave_encashment').upsert(
              { staff_id: b.staff_id, leave_type_id: t.id, units: round2(encashed), period: periodLabel, period_end: periodEndStr, status: 'pending' },
              { onConflict: 'staff_id,leave_type_id,period' },
            );
            encashments++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, action, period, balances_touched: touched, encashments }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('leave-jobs error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
