import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/ui/amount';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Download, Loader2, Lock, ShieldX } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { toast } from '@/lib/toast';
import { downloadPayslipPDF, type PayslipOrg, type PayslipSettlement, type PayslipStaff } from '@/lib/payslip-pdf';

type SettlementRow = PayslipSettlement & { id: string; staff_id: string };
type StaffRow = PayslipStaff & { id: string };
interface SheetLock {
  id: string;
  month: string;
  locked_by: string;
  locked_at: string;
}

// Management view of everyone's payslips (permission: payslips.download) with
// the month-level salary sheet lock (permission: settlements.lock). The lock is
// enforced server-side by a trigger on salary_settlements; this page is the
// button that sets/clears it.
export default function SalarySlips() {
  const { user, can } = useAuth();
  const { data: org } = useOrganizationProfile();

  const [selectedMonth, setSelectedMonth] = useState<string>(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [staffById, setStaffById] = useState<Record<string, StaffRow>>({});
  const [lock, setLock] = useState<SheetLock | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const canDownload = can('payslips.download');

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    try {
      const [settleRes, staffRes, lockRes] = await Promise.all([
        supabase
          .from('salary_settlements')
          .select('*')
          .eq('settlement_month', selectedMonth),
        supabase.from('staff').select('*'),
        supabase
          .from('salary_sheet_locks' as never)
          .select('*')
          .eq('month', selectedMonth)
          .maybeSingle(),
      ]);
      if (settleRes.error) throw settleRes.error;
      if (staffRes.error) throw staffRes.error;
      // The lock table may not exist yet on an un-migrated backend — treat any
      // error there as "not locked" so the payslip list still works.
      const settlements = (settleRes.data ?? []) as unknown as SettlementRow[];
      const staffMap: Record<string, StaffRow> = {};
      for (const s of (staffRes.data ?? []) as unknown as StaffRow[]) staffMap[s.id] = s;
      settlements.sort((a, b) =>
        (staffMap[a.staff_id]?.full_name ?? '').localeCompare(staffMap[b.staff_id]?.full_name ?? ''),
      );
      setRows(settlements);
      setStaffById(staffMap);
      setLock(lockRes.error ? null : ((lockRes.data as unknown as SheetLock | null) ?? null));
    } catch (e) {
      console.error('Error loading salary slips:', e);
      toast.error('Could not load salary slips for this month');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (canDownload) fetchMonth();
  }, [canDownload, fetchMonth]);

  if (!canDownload) {
    return (
      <EmptyState
        icon={ShieldX}
        title="Access Denied"
        description="Salary slips contain confidential compensation data. Ask an owner to grant the 'Download all payslips' permission."
      />
    );
  }

  const orgForSlip: PayslipOrg = {
    name: (org?.trade_name || org?.legal_name) ?? null,
    address: [org?.address, org?.city, org?.state, org?.pincode].filter(Boolean).join(', ') || null,
    gstin: org?.gstin ?? null,
    epf_number: (org as { epf_number?: string | null } | null)?.epf_number ?? null,
    esi_number: (org as { esi_number?: string | null } | null)?.esi_number ?? null,
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });
  const monthLabel = format(new Date(selectedMonth + '-01'), 'MMMM yyyy');

  const handleDownload = async (row: SettlementRow) => {
    const staff = staffById[row.staff_id];
    if (!staff) {
      toast.error('Staff record not found for this slip');
      return;
    }
    setDownloading(row.id);
    try {
      await downloadPayslipPDF(staff, row, orgForSlip);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the slip');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      for (const row of rows) {
        const staff = staffById[row.staff_id];
        if (!staff) continue;
        // Sequential on purpose: parallel jsPDF downloads trip popup blockers.
        await downloadPayslipPDF(staff, row, orgForSlip);
      }
      toast.success(`Downloaded ${rows.length} payslip${rows.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate all slips');
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Salary Slips"
        description="Download payslips for any staff member and lock the monthly salary sheet"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Salary sheet · {monthLabel}</CardTitle>
          <CardDescription>
            {rows.length} settled slip{rows.length === 1 ? '' : 's'} this month
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={rows.length === 0 || downloadingAll || loading}
                onClick={handleDownloadAll}
              >
                {downloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download all
              </Button>
            </div>
          </div>

          {lock && (
            <Alert className="border-warning bg-warning/10">
              <Lock className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Salary sheet for {monthLabel} was locked on {format(new Date(lock.locked_at), 'dd MMM yyyy, h:mm a')}.
                Lock and unlock now live on Process Payroll.
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No settled salaries"
              description={`No salary settlements found for ${monthLabel}. Slips appear here once salaries are settled.`}
            />
          ) : (
            <div className="divide-y rounded-xl border bg-card">
              {rows.map((row) => {
                const staff = staffById[row.staff_id];
                const paid = !!row.paid_at;
                return (
                  <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {staff?.full_name ?? 'Unknown staff'}
                        {staff?.employee_id ? <span className="text-muted-foreground"> · {staff.employee_id}</span> : null}
                      </p>
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
                      disabled={downloading === row.id || downloadingAll}
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
        </CardContent>
      </Card>

    </div>
  );
}
