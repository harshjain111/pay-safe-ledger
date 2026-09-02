import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StaffLite {
  id: string;
  employee_id: string;
  full_name: string;
}

interface Findings {
  /** Active staff with NO weekly off AND no roster row inside the period. */
  noSchedule: StaffLite[];
  /** leave_records in the period still awaiting review / type assignment. */
  pendingLeaveCount: number;
  /** Active staff with monthly_salary null or 0. */
  noSalary: StaffLite[];
  /** hr_pay_rules.unscheduled_is_off — when true, days with no roster are paid offs. */
  unscheduledIsOff: boolean;
}

/**
 * PHASE 0 (Attendo rebuild): surfaces the data conditions under which the pay
 * engine silently stops deducting absences. With an empty roster, no weekly
 * off, and hr_pay_rules.unscheduled_is_off = true (the default), EVERY day of
 * EVERY month classifies as a paid off-day in computeDayBreakdown() — staff
 * with zero check-ins draw full salary. This banner does not change any pay
 * behaviour; it makes the problem visible and links to the fix.
 *
 * Renders nothing when there are no findings. Dismissible per mount.
 */
export function PayrollDataIntegrityBanner({
  from,
  to,
  outletId,
  className,
}: {
  /** Period start, yyyy-MM-dd inclusive. */
  from: string;
  /** Period end, yyyy-MM-dd inclusive. */
  to: string;
  /** Optional outlet scope; omit for org-wide. */
  outletId?: string | null;
  className?: string;
}) {
  const [findings, setFindings] = useState<Findings | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let staffQuery = supabase
          .from('staff')
          .select('id, employee_id, full_name, weekly_off_day, monthly_salary, outlet_id')
          .eq('is_active', true);
        if (outletId) staffQuery = staffQuery.eq('outlet_id', outletId);

        const [staffRes, rosterRes, leaveRes, rulesRes] = await Promise.all([
          staffQuery,
          supabase.from('staff_roster').select('staff_id').gte('roster_date', from).lte('roster_date', to),
          supabase
            .from('leave_records')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .gte('leave_date', from)
            .lte('leave_date', to),
          supabase.from('hr_pay_rules' as never).select('unscheduled_is_off').maybeSingle(),
        ]);
        if (cancelled) return;
        if (staffRes.error) throw staffRes.error;

        type StaffRow = StaffLite & { weekly_off_day: number | null; monthly_salary: number | null };
        const staff = (staffRes.data ?? []) as unknown as StaffRow[];
        const rostered = new Set(((rosterRes.data ?? []) as { staff_id: string }[]).map((r) => r.staff_id));

        setFindings({
          noSchedule: staff
            .filter((s) => s.weekly_off_day == null && !rostered.has(s.id))
            .map(({ id, employee_id, full_name }) => ({ id, employee_id, full_name })),
          pendingLeaveCount: leaveRes.count ?? 0,
          noSalary: staff
            .filter((s) => !s.monthly_salary || Number(s.monthly_salary) === 0)
            .map(({ id, employee_id, full_name }) => ({ id, employee_id, full_name })),
          unscheduledIsOff:
            ((rulesRes.data as unknown as { unscheduled_is_off?: boolean } | null)?.unscheduled_is_off ?? true),
        });
      } catch (e) {
        // The banner is advisory — never let it break the page it sits on.
        console.error('PayrollDataIntegrityBanner check failed:', e);
        if (!cancelled) setFindings(null);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, outletId]);

  if (dismissed || !findings) return null;
  const { noSchedule, pendingLeaveCount, noSalary, unscheduledIsOff } = findings;
  const hasFindings = noSchedule.length > 0 || pendingLeaveCount > 0 || noSalary.length > 0;
  if (!hasFindings) return null;

  const nameList = (list: StaffLite[]) => {
    const shown = list.slice(0, 8);
    const rest = list.length - shown.length;
    return (
      <span className="text-xs text-muted-foreground">
        {shown.map((s) => `${s.full_name} (${s.employee_id})`).join(', ')}
        {rest > 0 ? ` — and ${rest} more` : ''}
      </span>
    );
  };

  return (
    <Card className={`border-warning/60 bg-warning/10 ${className ?? ''}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="flex-1 text-sm font-semibold text-warning">Payroll data integrity — this period has gaps that stop absences from being deducted</p>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setDismissed(true)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {noSchedule.length > 0 && (
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">{noSchedule.length} staff</span> have no weekly off and no roster for this
              period. Their absences will not be deducted.{' '}
              <Link to="/week-off" className="font-medium text-primary underline underline-offset-2">Set weekly offs</Link>
            </p>
            {nameList(noSchedule)}
            {unscheduledIsOff && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Pay Rules currently treat any day without a roster entry as a paid off-day
                  (&ldquo;unscheduled day is off&rdquo;). Until that setting is turned off or a roster exists,
                  setting a weekly off alone will not make absences deduct.
                </span>
              </p>
            )}
          </div>
        )}

        {pendingLeaveCount > 0 && (
          <p className="text-sm">
            <span className="font-medium">{pendingLeaveCount} absent day{pendingLeaveCount === 1 ? ' is' : 's are'}</span>{' '}
            not yet assigned a leave type. They will not deduct until assigned.{' '}
            <Link to="/leave-records" className="font-medium text-primary underline underline-offset-2">Review leave records</Link>
          </p>
        )}

        {noSalary.length > 0 && (
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">{noSalary.length} staff</span> have no monthly salary set — their
              settlement will compute to zero.{' '}
              <Link to="/staff" className="font-medium text-primary underline underline-offset-2">Open staff list</Link>
            </p>
            {nameList(noSalary)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
