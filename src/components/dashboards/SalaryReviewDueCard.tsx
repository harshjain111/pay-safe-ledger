import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarMonths, parseISO } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';

const DUE_AFTER_MONTHS = 12;

/**
 * PHASE 4 — "N staff are due a salary review", for Admin / HR / Owner
 * dashboards, linking to Salary Increments.
 *
 * Also fires the crossing notification: when a staff member passes 12 months
 * since their last revision (or joining, if never revised) and hasn't been
 * notified for THIS crossing, one notification goes to owner/admin/hr and the
 * staff row's salary_review_last_notified_at marker is stamped — an on-load
 * check (no cron), firing once per crossing, never daily.
 */
export function SalaryReviewDueCard() {
  const { userRole } = useAuth();
  const [dueCount, setDueCount] = useState<number | null>(null);

  const isManagement = userRole === 'owner' || userRole === 'admin' || userRole === 'hr';

  useEffect(() => {
    if (!isManagement) return;
    let cancelled = false;
    (async () => {
      try {
        const [staffRes, histRes] = await Promise.all([
          supabase.from('staff')
            .select('id, full_name, date_of_joining, salary_review_last_notified_at' as '*')
            .eq('is_active', true),
          supabase.from('salary_history' as never).select('staff_id, effective_from, effective_to'),
        ]);
        if (staffRes.error) throw staffRes.error;

        type StaffLite = { id: string; full_name: string; date_of_joining: string; salary_review_last_notified_at: string | null };
        type Hist = { staff_id: string; effective_from: string; effective_to: string | null };
        const revisedFrom = new Map<string, string>();
        const hasClosed = new Set<string>();
        for (const h of ((histRes.data ?? []) as unknown as Hist[])) {
          if (h.effective_to !== null) hasClosed.add(h.staff_id);
          if (h.effective_to === null) revisedFrom.set(h.staff_id, h.effective_from);
        }

        const today = new Date();
        const due: StaffLite[] = [];
        const toNotify: StaffLite[] = [];
        for (const s of (staffRes.data ?? []) as unknown as StaffLite[]) {
          // Never revised -> measure from joining (client-confirmed).
          const measureFrom = hasClosed.has(s.id) ? (revisedFrom.get(s.id) ?? s.date_of_joining) : s.date_of_joining;
          const months = differenceInCalendarMonths(today, parseISO(measureFrom));
          if (months < DUE_AFTER_MONTHS) continue;
          due.push(s);
          // Crossing marker: notify only if never notified since this crossing.
          const crossedAt = new Date(parseISO(measureFrom));
          crossedAt.setMonth(crossedAt.getMonth() + DUE_AFTER_MONTHS);
          if (!s.salary_review_last_notified_at || new Date(s.salary_review_last_notified_at) < crossedAt) {
            toNotify.push(s);
          }
        }
        if (cancelled) return;
        setDueCount(due.length);

        if (toNotify.length > 0) {
          const names = toNotify.slice(0, 5).map((s) => s.full_name).join(', ');
          await supabase.rpc('notify_users_by_role', {
            _roles: ['owner', 'admin', 'hr'] as never,
            _title: 'Salary reviews due',
            _message: `${toNotify.length} staff crossed 12 months since their last salary revision: ${names}${toNotify.length > 5 ? '…' : ''}. Open Salary Increments to review.`,
            _type: 'warning',
            _reference_type: 'salary',
            _reference_id: null,
          });
          await supabase.from('staff')
            .update({ salary_review_last_notified_at: new Date().toISOString() } as never)
            .in('id', toNotify.map((s) => s.id));
        }
      } catch (e) {
        // Advisory card — never break the dashboard.
        console.error('Salary review card failed:', e);
        if (!cancelled) setDueCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isManagement]);

  if (!isManagement || !dueCount) return null;

  return (
    <Link to="/payroll/increments" className="block">
      <Card className="border-warning/50 bg-warning/10 transition-colors hover:bg-warning/15">
        <CardContent className="flex items-center gap-3 p-4">
          <TrendingUp className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{dueCount} staff {dueCount === 1 ? 'is' : 'are'} due a salary review</p>
            <p className="text-xs text-muted-foreground">12+ months since their last revision (or joining). Open Salary Increments →</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
