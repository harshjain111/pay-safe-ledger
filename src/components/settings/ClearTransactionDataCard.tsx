import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { 
  Trash2, 
  Download, 
  AlertTriangle, 
  Shield, 
  CheckCircle2, 
  Loader2,
  CalendarIcon,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function ClearTransactionDataCard() {
  const { isOwner, user } = useAuth();
  
  // State management
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Flow states
  const [backupGenerated, setBackupGenerated] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [backupTimestamp, setBackupTimestamp] = useState<string | null>(null);
  const [isGeneratingBackup, setIsGeneratingBackup] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  
  // Only visible to Owner
  if (!isOwner) {
    return null;
  }

  const generateBackup = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Please select date range first');
      return;
    }

    if (dateFrom > dateTo) {
      toast.error('Start date must be before end date');
      return;
    }

    setIsGeneratingBackup(true);

    try {
      const fromDate = format(dateFrom, 'yyyy-MM-dd');
      const toDate = format(dateTo, 'yyyy-MM-dd');

      // Fetch all transaction data with staff names resolved
      const [
        journalEntriesResult,
        journalLinesResult,
        ledgerEntriesResult,
        salarySettlementsResult,
        paymentRequestsResult,
        expensesResult,
      ] = await Promise.all([
        supabase
          .from('journal_entries')
          .select('*, staff:staff_id(full_name)')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false }),
        supabase
          .from('journal_lines')
          .select('*, staff:staff_id(full_name), account:account_id(code, name), journal_entry:journal_entry_id(entry_date, reference_no)')
          .order('created_at', { ascending: false }),
        supabase
          .from('ledger_entries')
          .select('*, staff:staff_id(full_name)')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false }),
        supabase
          .from('salary_settlements')
          .select('*, staff:staff_id(full_name)')
          .gte('created_at', fromDate)
          .lte('created_at', toDate + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_requests')
          .select('*, staff:staff_id(full_name)')
          .gte('created_at', fromDate)
          .lte('created_at', toDate + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('*, staff:staff_id(full_name)')
          .gte('expense_date', fromDate)
          .lte('expense_date', toDate)
          .order('expense_date', { ascending: false }),
      ]);

      // Format data for Excel
      const formatJournalEntries = (data: any[]) => data.map(row => ({
        'Reference No': row.reference_no,
        'Entry Date': row.entry_date ? format(new Date(row.entry_date), 'dd-MMM-yyyy') : '',
        'Staff Name': row.staff?.full_name || 'N/A',
        'Transaction Type': row.transaction_type,
        'Description': row.description,
        'Is Immutable': row.is_immutable ? 'Yes' : 'No',
        'Created At': row.created_at ? format(new Date(row.created_at), 'dd-MMM-yyyy HH:mm') : '',
      }));

      const formatJournalLines = (data: any[]) => data.map(row => ({
        'Journal Ref': row.journal_entry?.reference_no || 'N/A',
        'Entry Date': row.journal_entry?.entry_date ? format(new Date(row.journal_entry.entry_date), 'dd-MMM-yyyy') : '',
        'Account Code': row.account?.code || '',
        'Account Name': row.account?.name || '',
        'Staff Name': row.staff?.full_name || 'N/A',
        'Debit': row.debit || 0,
        'Credit': row.credit || 0,
        'Description': row.description || '',
      }));

      const formatLedgerEntries = (data: any[]) => data.map(row => ({
        'Voucher No': row.voucher_no,
        'Voucher Type': row.voucher_type,
        'Entry Date': row.entry_date ? format(new Date(row.entry_date), 'dd-MMM-yyyy') : '',
        'Staff Name': row.staff?.full_name || 'N/A',
        'Debit': row.debit || 0,
        'Credit': row.credit || 0,
        'Running Balance': row.running_balance || 0,
        'Description': row.description,
        'Payment Mode': row.payment_mode || '',
        'Reference Month': row.reference_month || '',
      }));

      const formatSalarySettlements = (data: any[]) => data.map(row => ({
        'Staff Name': row.staff?.full_name || 'N/A',
        'Settlement Month': row.settlement_month,
        'Base Salary': row.base_salary || 0,
        'Leave Days': row.leave_days || 0,
        'Leave Deduction': row.leave_deduction || 0,
        'Net Salary': row.net_salary || 0,
        'Advances Adjusted': row.advances_adjusted || 0,
        'Balance Payable': row.balance_payable || 0,
        'Status': row.status,
        'Settled At': row.settled_at ? format(new Date(row.settled_at), 'dd-MMM-yyyy HH:mm') : '',
        'Paid At': row.paid_at ? format(new Date(row.paid_at), 'dd-MMM-yyyy HH:mm') : '',
      }));

      const formatPaymentRequests = (data: any[]) => data.map(row => ({
        'Staff Name': row.staff?.full_name || 'N/A',
        'Amount': row.amount || 0,
        'Reason': row.reason,
        'Payout Type': row.payout_type || 'advance',
        'Status': row.status,
        'Created At': row.created_at ? format(new Date(row.created_at), 'dd-MMM-yyyy HH:mm') : '',
        'Approved At': row.approved_at ? format(new Date(row.approved_at), 'dd-MMM-yyyy HH:mm') : '',
        'Paid At': row.paid_at ? format(new Date(row.paid_at), 'dd-MMM-yyyy HH:mm') : '',
      }));

      const formatExpenses = (data: any[]) => data.map(row => ({
        'Staff Name': row.staff?.full_name || 'N/A',
        'Expense Date': row.expense_date ? format(new Date(row.expense_date), 'dd-MMM-yyyy') : '',
        'Category': row.category,
        'Amount': row.amount || 0,
        'Description': row.description,
        'Status': row.status,
        'Submitted At': row.submitted_at ? format(new Date(row.submitted_at), 'dd-MMM-yyyy HH:mm') : '',
        'Approved At': row.approved_at ? format(new Date(row.approved_at), 'dd-MMM-yyyy HH:mm') : '',
        'Reimbursed At': row.reimbursed_at ? format(new Date(row.reimbursed_at), 'dd-MMM-yyyy HH:mm') : '',
      }));

      // Create workbook
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Add sheets
      const sheets = [
        { name: 'Journal Entries', data: formatJournalEntries(journalEntriesResult.data || []) },
        { name: 'Journal Lines', data: formatJournalLines(journalLinesResult.data || []) },
        { name: 'Ledger Entries', data: formatLedgerEntries(ledgerEntriesResult.data || []) },
        { name: 'Salary Settlements', data: formatSalarySettlements(salarySettlementsResult.data || []) },
        { name: 'Payment Requests', data: formatPaymentRequests(paymentRequestsResult.data || []) },
        { name: 'Expenses', data: formatExpenses(expensesResult.data || []) },
      ];

      // Add metadata sheet
      const metadata = [
        { Field: 'Backup Date', Value: format(new Date(), 'dd-MMM-yyyy HH:mm:ss') },
        { Field: 'Date Range From', Value: format(dateFrom, 'dd-MMM-yyyy') },
        { Field: 'Date Range To', Value: format(dateTo, 'dd-MMM-yyyy') },
        { Field: 'Generated By', Value: user?.email || 'Unknown' },
        { Field: 'Journal Entries Count', Value: journalEntriesResult.data?.length || 0 },
        { Field: 'Journal Lines Count', Value: journalLinesResult.data?.length || 0 },
        { Field: 'Ledger Entries Count', Value: ledgerEntriesResult.data?.length || 0 },
        { Field: 'Salary Settlements Count', Value: salarySettlementsResult.data?.length || 0 },
        { Field: 'Payment Requests Count', Value: paymentRequestsResult.data?.length || 0 },
        { Field: 'Expenses Count', Value: expensesResult.data?.length || 0 },
      ];

      const metadataSheet = XLSX.utils.json_to_sheet(metadata);
      XLSX.utils.book_append_sheet(wb, metadataSheet, 'Backup Info');

      sheets.forEach(({ name, data }) => {
        const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'No Data': 'No records found in this date range' }]);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });

      // Generate and download
      const fileName = `Transaction_Backup_${format(dateFrom, 'yyyyMMdd')}_to_${format(dateTo, 'yyyyMMdd')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      const timestamp = new Date().toISOString();
      setBackupTimestamp(timestamp);
      setBackupGenerated(true);
      setBackupDownloaded(true);
      toast.success('Backup generated and downloaded successfully');

    } catch (error: any) {
      console.error('Backup generation error:', error);
      toast.error('Failed to generate backup: ' + (error.message || 'Unknown error'));
    } finally {
      setIsGeneratingBackup(false);
    }
  };

  const handleInitiateClear = () => {
    if (!backupDownloaded) {
      toast.error('Please generate and download backup first');
      return;
    }
    setShowWarningDialog(true);
  };

  const handleWarningConfirm = () => {
    setShowWarningDialog(false);
    setShowFinalConfirm(true);
  };

  const handleFinalClear = async () => {
    if (!password) {
      toast.error('Please enter your password');
      return;
    }

    if (!dateFrom || !dateTo) {
      toast.error('Date range is required');
      return;
    }

    setIsClearingData(true);

    try {
      // Call edge function for secure deletion
      const { data, error } = await supabase.functions.invoke('clear-transaction-data', {
        body: {
          password,
          dateFrom: format(dateFrom, 'yyyy-MM-dd'),
          dateTo: format(dateTo, 'yyyy-MM-dd'),
          backupTimestamp,
        },
      });

      if (error) {
        // supabase-js wraps a non-2xx edge-function response in a FunctionsHttpError
        // whose `context` is the raw Response. Read the JSON body so the user sees the
        // real reason (permission / RPC / validation) instead of a generic
        // "Edge Function returned a non-2xx status code".
        let message = error.message;
        const ctx = (error as { context?: unknown }).context;
        if (ctx instanceof Response) {
          const body = await ctx.clone().json().catch(() => null);
          if (body && typeof body.error === 'string' && body.error.trim()) {
            message = body.error;
          }
        }
        throw new Error(message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to clear data');
      }

      toast.success(`Transaction data cleared successfully. ${data.deletedCounts.total} records removed.`);
      
      // Reset state
      setShowFinalConfirm(false);
      setPassword('');
      setBackupGenerated(false);
      setBackupDownloaded(false);
      setBackupTimestamp(null);
      setDateFrom(undefined);
      setDateTo(undefined);

    } catch (error: any) {
      console.error('Clear data error:', error);
      toast.error(error.message || 'Failed to clear transaction data');
    } finally {
      setIsClearingData(false);
    }
  };

  const canGenerateBackup = dateFrom && dateTo && dateFrom <= dateTo;
  const canClear = backupDownloaded && dateFrom && dateTo;

  return (
    <>
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-destructive">
            <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
            Clear Transaction Data
            <Badge variant="destructive" className="ml-2 text-xs">Danger Zone</Badge>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Permanently delete transaction data within a date range. This action is <strong>irreversible</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
          {/* Date Range Selection */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10 sm:h-11",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd MMM yyyy") : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10 sm:h-11",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd MMM yyyy") : "Select end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    disabled={(date) => date > new Date() || (dateFrom && date < dateFrom)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Step 1: Mandatory Backup */}
          <div className="space-y-3 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                backupDownloaded ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
              )}>
                {backupDownloaded ? <CheckCircle2 className="h-4 w-4" /> : "1"}
              </div>
              <h4 className="font-medium text-sm">Mandatory Backup</h4>
              {backupDownloaded && (
                <Badge variant="outline" className="text-green-600 border-green-500 text-xs">
                  Completed
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground ml-8">
              You must generate and download a full backup before clearing any data.
            </p>
            
            <div className="ml-8">
              <Button
                variant={backupDownloaded ? "outline" : "secondary"}
                size="sm"
                onClick={generateBackup}
                disabled={!canGenerateBackup || isGeneratingBackup}
                className="gap-2"
              >
                {isGeneratingBackup ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    {backupDownloaded ? 'Re-download Backup' : 'Generate & Download Backup'}
                  </>
                )}
              </Button>
              
              {backupTimestamp && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last backup: {format(new Date(backupTimestamp), 'dd MMM yyyy, HH:mm:ss')}
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Clear Data */}
          <div className="space-y-3 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                "bg-muted text-muted-foreground"
              )}>
                2
              </div>
              <h4 className="font-medium text-sm">Clear Transaction Data</h4>
            </div>
            
            <div className="ml-8 space-y-2">
              <p className="text-xs text-muted-foreground">
                This will permanently delete:
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>Journal entries & journal lines</li>
                <li>Ledger entries</li>
                <li>Salary settlements</li>
                <li>Payment requests (advances)</li>
                <li>Expenses</li>
              </ul>
              <p className="text-xs font-medium text-destructive">
                Staff records, user accounts, roles, and chart of accounts will NOT be deleted.
              </p>
            </div>
            
            <div className="ml-8">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleInitiateClear}
                disabled={!canClear}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear Transaction Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warning Dialog */}
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Warning: Irreversible Action
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2">
              <p>You are about to permanently delete all transaction data from:</p>
              <p className="font-medium text-foreground">
                {dateFrom && format(dateFrom, 'dd MMM yyyy')} → {dateTo && format(dateTo, 'dd MMM yyyy')}
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone. All balances will reset to zero.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleWarningConfirm}
            >
              I Understand, Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Final Confirmation with Password */}
      <AlertDialog open={showFinalConfirm} onOpenChange={setShowFinalConfirm}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Final Confirmation Required
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Enter your password to confirm this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground">Date Range</p>
              <p className="font-medium text-sm">
                {dateFrom && format(dateFrom, 'dd MMM yyyy')} → {dateTo && format(dateTo, 'dd MMM yyyy')}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm">Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearingData}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleFinalClear}
              disabled={!password || isClearingData}
            >
              {isClearingData ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Confirm & Clear Data
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
