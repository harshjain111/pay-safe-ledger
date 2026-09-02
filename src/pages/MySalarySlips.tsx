import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { PageHeader, EmptyState, InlineNote } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/ui/amount';
import { FileText, Download, Loader2, IdCard } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { downloadPayslipPDF, type PayslipSettlement, type PayslipStaff } from '@/lib/payslip-pdf';
import { fetchPayslipExtras, orgToPayslipOrg } from '@/lib/payslip-extras';

type SettlementRow = PayslipSettlement & { id: string; status?: string | null };

// ---------------------------------------------------------------------------
// PHASE 5C — the employee surface. Mobile-first; ONLY the signed-in
// employee's own months (RLS: "Staff can view own settlements" restricts the
// read to staff_id = get_user_staff_id(auth.uid())); a month appears ONLY
// once it is finalized — its salary sheet is locked, or it is paid. NEVER a
// draft slip. One download per month; no bulk download on this surface.
// ---------------------------------------------------------------------------
export default function MySalarySlips() {
  const { staffData } = useAuth();
  const { data: org } = useOrganizationProfile();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const staff = staffData as unknown as (PayslipStaff & { id?: string }) | null;

  useEffect(() => {
    if (!staff?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [setRes, lockRes] = await Promise.all([
        supabase
          .from('salary_settlements')
          .select('*')
          .eq('staff_id', staff.id)
          .order('settlement_month', { ascending: false }),
        supabase.from('salary_sheet_locks' as never).select('month'),
      ]);
      if (cancelled) return;
      if (setRes.error) toast.error('Could not load your salary slips');
      const lockedMonths = new Set((((lockRes.data ?? []) as unknown) as { month: string }[]).map((l) => l.month));
      // FINALIZED ONLY: the month's sheet is locked, or the slip is paid.
      const finalised = ((setRes.data ?? []) as unknown as SettlementRow[]).filter(
        (r) => lockedMonths.has(r.settlement_month) || !!r.paid_at,
      );
      setRows(finalised);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [staff?.id]);

  const handleDownload = async (row: SettlementRow) => {
    if (!staff?.id) return;
    setDownloading(row.id);
    try {
      const extras = (await fetchPayslipExtras([staff.id])).get(staff.id);
      await downloadPayslipPDF(staff, row, orgToPayslipOrg(org as never), extras);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the slip');
    } finally {
      setDownloading(null);
    }
  };

  const pan = (staff as { pan_number?: string | null } | null)?.pan_number;
  const uan = (staff as { uan_number?: string | null } | null)?.uan_number;
  const esic = (staff as { esic_number?: string | null } | null)?.esic_number;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 sm:space-y-6 sm:p-6">
      <PageHeader title="My Salary Slips" count={loading ? undefined : rows.length} />

      {/* Statutory identifiers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4 text-primary" /> My statutory details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {[['PAN', pan], ['UAN (EPFO)', uan], ['ESIC No.', esic]].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border bg-muted/30 p-2.5 sm:p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-sm font-medium tabular-nums sm:text-base">{(value as string) || '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Slips */}
      {!staff?.id ? (
        <EmptyState icon={FileText} title="No employee profile" instruction="Salary slips are available to employees linked to a staff record — ask HR to link yours." />
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No salary slips yet" instruction="A slip appears here once its month's payroll is finalized by HR." />
      ) : (
        <>
          <div className="divide-y rounded-xl border bg-card">
            {rows.map((row) => {
              const paid = !!row.paid_at;
              return (
                <div key={row.id} className="flex items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-10 sm:w-10">
                    <FileText className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium sm:text-base">{format(new Date(row.settlement_month + '-01'), 'MMMM yyyy')}</p>
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      Net payable <Amount value={row.balance_payable} size="sm" className="font-medium" />
                      {' · '}
                      {paid
                        ? `Paid ${row.paid_at ? format(new Date(row.paid_at), 'dd MMM yyyy') : ''}`
                        : `Finalized ${row.settled_at ? format(new Date(row.settled_at), 'dd MMM yyyy') : ''}`}
                    </p>
                  </div>
                  <Badge variant={paid ? 'default' : 'secondary'} className="hidden shrink-0 sm:inline-flex">{paid ? 'Paid' : 'Finalized'}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={downloading === row.id}
                    onClick={() => handleDownload(row)}
                  >
                    {downloading === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </div>
              );
            })}
          </div>
          <InlineNote>Slips appear here once payroll for the month is finalized. Question about a figure? Contact HR.</InlineNote>
        </>
      )}
    </div>
  );
}
