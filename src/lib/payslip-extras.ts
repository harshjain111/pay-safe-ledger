// PHASE 5 — shared data the payslip prints beyond the settlement row.

import { supabase } from '@/integrations/supabase/client';
import {
  accruedForType, fetchLeaveTypes, fetchLeaveYearStartMonth, leaveYearFor,
  type LeaveTypeRow,
} from './leave';
import type { PayslipExtras, PayslipOrg } from './payslip-pdf';

/**
 * Leave balances for the payslip's "Bal. SL/CL" and "Bal. PL" lines.
 *
 * Uses the SAME definition the employee sees on their dashboard and in Leave
 * Records — accrued-for-the-leave-year minus approved days used — so a payslip
 * never contradicts the app. Computed in two queries for the whole staff set
 * rather than per employee, so a 214-slip bulk download stays fast.
 *
 * SL/CL types may not exist in this org; the payslip then prints 0.00/0.00
 * (never throws, never omits the line).
 */
export async function fetchPayslipExtras(staffIds: string[]): Promise<Map<string, PayslipExtras>> {
  const out = new Map<string, PayslipExtras>();
  if (staffIds.length === 0) return out;
  try {
    const startMonth = await fetchLeaveYearStartMonth();
    const ly = leaveYearFor(new Date(), startMonth);
    const [types, usedRes] = await Promise.all([
      fetchLeaveTypes(true),
      supabase
        .from('leave_records')
        .select('staff_id, leave_type_id')
        .eq('status', 'approved')
        .in('staff_id', staffIds)
        .gte('leave_date', ly.fromISO)
        .lte('leave_date', ly.toISO),
    ]);

    // used[staffId][typeId]
    const used = new Map<string, Map<string, number>>();
    for (const r of (usedRes.data ?? []) as { staff_id: string; leave_type_id: string | null }[]) {
      if (!r.leave_type_id) continue;
      const perStaff = used.get(r.staff_id) ?? new Map<string, number>();
      perStaff.set(r.leave_type_id, (perStaff.get(r.leave_type_id) ?? 0) + 1);
      used.set(r.staff_id, perStaff);
    }

    const plType = types.find((t) => t.code === 'PL') ?? types.find((t) => t.is_default);
    const pick = (code: string) => types.find((t) => t.code === code);
    const slType = pick('SL');
    const clType = pick('CL');

    const balanceFor = (staffId: string, type: LeaveTypeRow | undefined): number => {
      if (!type) return 0;
      const accrued = accruedForType(type, ly.fyStartYear, new Date());
      const taken = used.get(staffId)?.get(type.id) ?? 0;
      return Math.round((accrued - taken) * 100) / 100;
    };

    for (const staffId of staffIds) {
      out.set(staffId, {
        balSL: balanceFor(staffId, slType),
        balCL: balanceFor(staffId, clType),
        balPL: balanceFor(staffId, plType),
      });
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
