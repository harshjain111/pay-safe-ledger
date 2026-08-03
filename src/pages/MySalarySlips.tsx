import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/ui/amount';
import { FileText, Download, Loader2, IdCard } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { downloadPayslipPDF, type PayslipStaff, type PayslipOrg, type PayslipSettlement } from '@/lib/payslip-pdf';

type SettlementRow = PayslipSettlement & { id: string; status?: string | null };

export default function MySalarySlips() {
  const { staffData } = useAuth();
  const { data: org } = useOrganizationProfile();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const staff = staffData as unknown as (PayslipStaff & { id?: string }) | null;

  useEffect(() => {
    if (!staff?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('salary_settlements')
        .select('*')
        .eq('staff_id', staff.id)
        .order('settlement_month', { ascending: false });
      if (!cancelled) {
        if (error) toast.error('Could not load your salary slips');
        // Only finalised slips (settled or paid) are shown to the employee.
        const finalised = ((data ?? []) as unknown as SettlementRow[]).filter((r) => r.settled_at || r.paid_at);
        setRows(finalised);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [staff?.id]);

  const orgForSlip: PayslipOrg = {
    name: (org?.trade_name || org?.legal_name) ?? null,
    address: [org?.address, org?.city, org?.state, org?.pincode].filter(Boolean).join(', ') || null,
    gstin: org?.gstin ?? null,
    epf_number: (org as { epf_number?: string | null } | null)?.epf_number ?? null,
    esi_number: (org as { esi_number?: string | null } | null)?.esi_number ?? null,
  };

  const handleDownload = async (row: SettlementRow) => {
    if (!staff) return;
    setDownloading(row.id);
    try {
      await downloadPayslipPDF(staff, row, orgForSlip);
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
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader title="My Salary Slips" description="View and download your payslip for any month." />

      {/* Statutory identifiers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4 text-primary" /> My statutory details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[['PAN', pan], ['UAN (EPFO)', uan], ['ESIC No.', esic]].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-medium tabular-nums">{(value as string) || '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Slips */}
      {!staff?.id ? (
        <EmptyState icon={FileText} title="No employee profile" description="Salary slips are available to employees linked to a staff record." />
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No salary slips yet" description="Your payslips will appear here once your salary is settled." />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((row) => {
            const paid = !!row.paid_at;
            return (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{format(new Date(row.settlement_month + '-01'), 'MMMM yyyy')}</p>
                  <p className="text-xs text-muted-foreground">
                    Net payable <Amount value={row.balance_payable} size="sm" className="font-medium" />
                    {' · '}
                    {paid
                      ? `Paid ${row.paid_at ? format(new Date(row.paid_at), 'dd MMM yyyy') : ''}`
                      : `Settled ${row.settled_at ? format(new Date(row.settled_at), 'dd MMM yyyy') : ''}`}
                  </p>
                </div>
                <Badge variant={paid ? 'default' : 'secondary'} className="shrink-0">{paid ? 'Paid' : 'Settled'}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  disabled={downloading === row.id}
                  onClick={() => handleDownload(row)}
                >
                  {downloading === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Slip
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
