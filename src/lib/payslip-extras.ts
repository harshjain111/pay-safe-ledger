// PHASE 5 — shared data the payslip prints beyond the settlement row.

import { supabase } from '@/integrations/supabase/client';
import type { PayslipExtras, PayslipOrg } from './payslip-pdf';

/**
 * Leave balances for the payslip's "Bal. SL/CL" and "Bal. PL" lines, per
 * staff. SL/CL types may not exist in this org — the payslip then prints
 * 0.00/0.00 (never throws, never omits the line).
 *
 * Reads `employee_leave_balance` — the table the Leave Assign / Leave Balance
 * screens actually write. (There is a second, unused `leave_balances` table in
 * the schema with an opening/year shape; reading that one made every payslip
 * print 0.00 regardless of the employee's real balance.)
 */
export async function fetchPayslipExtras(staffIds: string[]): Promise<Map<string, PayslipExtras>> {
  const out = new Map<string, PayslipExtras>();
  if (staffIds.length === 0) return out;
  try {
    const [typesRes, balRes] = await Promise.all([
      supabase.from('leave_types' as never).select('id, code, is_default'),
      supabase.from('employee_leave_balance' as never)
        .select('staff_id, leave_type_id, balance')
        .in('staff_id', staffIds),
    ]);
    type LeaveType = { id: string; code: string; is_default: boolean | null };
    const types = (typesRes.data ?? []) as unknown as LeaveType[];
    const byId = new Map(types.map((t) => [t.id, t]));
    const plId = types.find((t) => t.code === 'PL')?.id ?? types.find((t) => t.is_default)?.id;

    type Bal = { staff_id: string; leave_type_id: string; balance: number | null };
    for (const b of (balRes.data ?? []) as unknown as Bal[]) {
      const t = byId.get(b.leave_type_id);
      if (!t) continue;
      const cur = out.get(b.staff_id) ?? {};
      const v = Number(b.balance ?? 0);
      if (t.code === 'SL') cur.balSL = (cur.balSL ?? 0) + v;
      else if (t.code === 'CL') cur.balCL = (cur.balCL ?? 0) + v;
      else if (t.id === plId) cur.balPL = (cur.balPL ?? 0) + v;
      out.set(b.staff_id, cur);
    }
  } catch (e) {
    // Balances are decoration on the slip — never block a download over them.
    console.error('fetchPayslipExtras failed:', e);
  }
  return out;
}

/** Map the organization_profile row to the payslip's employer block. */
export function orgToPayslipOrg(org: Record<string, unknown> | null | undefined): PayslipOrg {
  const o = (org ?? {}) as {
    legal_name?: string | null; trade_name?: string | null; address?: string | null;
    city?: string | null; pincode?: string | null; brand_code?: string | null;
  };
  return {
    // The payslip header prints the LEGAL name.
    name: o.legal_name || o.trade_name || null,
    address: o.address ?? null,
    city: o.city ?? null,
    pincode: o.pincode ?? null,
    brand_code: o.brand_code ?? null,
  };
}
