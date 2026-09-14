import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, InlineNote, Paginator } from '@/components/patterns';
import { usePagination } from '@/hooks/usePagination';
import { Amount } from '@/components/ui/amount';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { fetchSalaryRegister, monthHeading, type SalaryRegister } from '@/lib/salary-register';
import { downloadSalaryRegister } from '@/lib/salary-register-export';
import { toast } from '@/lib/toast';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// The monthly salary register, in the shape the accountant already keeps by
// hand: attendance, the earnings split, statutory deductions, net pay and the
// employer's contributions, with a totals row.
//
// On screen it shows the money columns only — the full 23-column sheet is what
// the download is for, and cramming it into a viewport helps nobody. What
// matters here is being able to see the month is right before sending it.
// ---------------------------------------------------------------------------

function lastMonths(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function SalaryRegisterReport() {
  const { data: org } = useOrganizationProfile();
  const months = useMemo(() => lastMonths(18), []);
  const [month, setMonth] = useState(months[0]);
  const [register, setRegister] = useState<SalaryRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRegister(await fetchSalaryRegister(month));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the register');
      setRegister(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const rows = register?.rows ?? [];
  const pager = usePagination(rows, 20);

  const download = async () => {
    if (!register || register.rows.length === 0) return;
    setDownloading(true);
    try {
      await downloadSalaryRegister(register, {
        name: (org as { legal_name?: string; trade_name?: string } | null)?.legal_name
          ?? (org as { trade_name?: string } | null)?.trade_name,
        address: [
          (org as { address?: string } | null)?.address,
          (org as { city?: string } | null)?.city,
          (org as { pincode?: string } | null)?.pincode,
        ].filter(Boolean).join(', '),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not build the file');
    } finally {
      setDownloading(false);
    }
  };

  const t = register?.totals;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-4">
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-11 w-full sm:h-10 sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{monthHeading(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={download}
            disabled={downloading || loading || rows.length === 0}
            className="h-11 gap-1.5 sm:ml-auto sm:h-10"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Excel
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Couldn't load the register"
          instruction={`${error} Check your connection and try again.`}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={`No payroll settled for ${monthHeading(month)}`}
          instruction="The register is built from settled payroll. Run and finalize the month on Process Payroll, and it appears here."
        />
      ) : (
        <>
          <InlineNote>
            {rows.length} employees. The download carries all 23 columns — attendance,
            the earnings split, every deduction and the employer&rsquo;s contributions.
            The table below shows the money columns only.
          </InlineNote>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead className="whitespace-nowrap">#</TableHead>
                  <TableHead className="whitespace-nowrap">Employee</TableHead>
                  <TableHead className="whitespace-nowrap">Outlet</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Present</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Gross</TableHead>
                  <TableHead className="whitespace-nowrap text-right">PF</TableHead>
                  <TableHead className="whitespace-nowrap text-right">ESI</TableHead>
                  <TableHead className="whitespace-nowrap text-right">P.Tax</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Advance</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total ded.</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageRows.map((r) => (
                  <TableRow key={`${r.slNo}-${r.name}`}>
                    <TableCell className="text-muted-foreground">{r.slNo}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.outlet || '—'}</TableCell>
                    <TableCell className="text-center tabular-nums">{r.present}/{r.workingDays}</TableCell>
                    <TableCell className="text-right"><Amount value={r.gross} /></TableCell>
                    <TableCell className="text-right"><Amount value={r.pfEmployee} /></TableCell>
                    <TableCell className="text-right"><Amount value={r.esiEmployee} /></TableCell>
                    <TableCell className="text-right"><Amount value={r.pTax} /></TableCell>
                    <TableCell className="text-right"><Amount value={r.advance} /></TableCell>
                    <TableCell className="text-right"><Amount value={r.totalDeductions} /></TableCell>
                    <TableCell className="text-right font-semibold"><Amount value={r.net} /></TableCell>
                  </TableRow>
                ))}
                {t && (
                  <TableRow className="border-t-2 bg-muted/30 font-semibold">
                    <TableCell />
                    <TableCell className="whitespace-nowrap">TOTAL</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right"><Amount value={t.gross} /></TableCell>
                    <TableCell className="text-right"><Amount value={t.pfEmployee} /></TableCell>
                    <TableCell className="text-right"><Amount value={t.esiEmployee} /></TableCell>
                    <TableCell className="text-right"><Amount value={t.pTax} /></TableCell>
                    <TableCell className="text-right"><Amount value={t.advance} /></TableCell>
                    <TableCell className="text-right"><Amount value={t.totalDeductions} /></TableCell>
                    <TableCell className="text-right"><Amount value={t.net} /></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {rows.length > pager.pageSize && <Paginator {...pager} noun="Employees" />}
        </>
      )}
    </div>
  );
}
