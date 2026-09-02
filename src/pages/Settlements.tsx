import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { toAmount } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Amount } from '@/components/ui/amount';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Calculator, Check, AlertTriangle, Lock, Info, ShieldX, Download, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';
import { format, subMonths, parseISO } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { PayrollDataIntegrityBanner } from '@/components/payroll/PayrollDataIntegrityBanner';
import { EnhancedSettlementConfirmDialog } from '@/components/settlements/EnhancedSettlementConfirmDialog';
import { ZeroPaymentConfirmDialog } from '@/components/settlements/ZeroPaymentConfirmDialog';
import { AdvanceAdjustmentInput } from '@/components/settlements/AdvanceAdjustmentInput';
import { downloadPayslipPDF } from '@/lib/payslip-pdf';
import {
  computeSettlement,
  gatherSettlementInputs,
  persistGroupSettlement,
  type SettlementInputs,
} from '@/lib/settlement-engine';
import type { Staff, PaymentMode } from '@/types/database';

interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: boolean;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

// ============================================================================
// PHASE 3A (Attendo rebuild): this screen no longer carries its own payroll
// math. Everything is gatherSettlementInputs() -> computeSettlement() from
// settlement-engine.ts — the SAME functions the Process Payroll grid runs — so
// single settle and batch settle can never pay different amounts.
// The old "Desired Net Payable", "Final Deduction (Owner Override)" and
// "Override absent days" fields are deleted, not ported: corrections happen
// upstream in Bulk Attendance Adjustments; the audited Adjust drawer on
// Process Payroll is the only escape hatch.
// ============================================================================
export default function Settlements() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, staffData, canAccessSettlements } = useAuth();
  const queryClient = useQueryClient();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(searchParams.get('staff') || '');
  const [selectedMonth, setSelectedMonth] = useState<string>(searchParams.get('month') || format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [inputs, setInputs] = useState<SettlementInputs | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isAlreadySettled, setIsAlreadySettled] = useState(false);
  const [isSheetLocked, setIsSheetLocked] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showZeroPaymentDialog, setShowZeroPaymentDialog] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');

  // Monthly variable inputs (legitimate pre-settle variables, not overrides).
  const [incentivesInput, setIncentivesInput] = useState<number>(0);
  const [bonusInput, setBonusInput] = useState<number>(0);
  const [overtimeOverride, setOvertimeOverride] = useState<number | null>(null);
  const [overtimeOverrideReason, setOvertimeOverrideReason] = useState<string>('');
  const [advanceToAdjust, setAdvanceToAdjust] = useState(0);

  // ---- data loading -----------------------------------------------------------
  useEffect(() => {
    if (!canAccessSettlements) return;
    (async () => {
      const { data, error } = await supabase.from('staff').select('*').eq('is_active', true).order('full_name');
      if (!error) setStaff((data ?? []) as Staff[]);
    })();
  }, [canAccessSettlements]);

  const validateSettlement = useCallback(async () => {
    try {
      const [{ data: settledData }, lockRes, { data: validationData, error }] = await Promise.all([
        supabase.rpc('is_salary_settled', { _staff_id: selectedStaffId, _month: selectedMonth }),
        supabase.from('salary_sheet_locks' as never).select('month').eq('month', selectedMonth).maybeSingle(),
        supabase.rpc('validate_settlement', { _staff_id: selectedStaffId, _month: selectedMonth }),
      ]);
      setIsAlreadySettled(!!settledData);
      setIsSheetLocked(!lockRes.error && !!lockRes.data);
      if (error) throw error;
      setValidation(validationData as unknown as ValidationResult);
    } catch (error) {
      console.error('Error validating settlement:', error);
    }
  }, [selectedStaffId, selectedMonth]);

  useEffect(() => {
    if (!canAccessSettlements || !selectedStaffId || !selectedMonth) return;
    let cancelled = false;
    setAdvanceToAdjust(0);
    setIncentivesInput(0);
    setBonusInput(0);
    setOvertimeOverride(null);
    setOvertimeOverrideReason('');
    validateSettlement();
    (async () => {
      setIsCalculating(true);
      try {
        const staffRow = staff.find((s) => s.id === selectedStaffId);
        if (!staffRow) return;
        const gathered = await gatherSettlementInputs(staffRow, selectedMonth);
        if (!cancelled) setInputs(gathered);
      } catch (e) {
        console.error('Error gathering settlement inputs:', e);
        toast({ title: 'Calculation Error', description: 'Failed to calculate settlement. Please try again.', variant: 'destructive' });
      } finally {
        if (!cancelled) setIsCalculating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canAccessSettlements, selectedStaffId, selectedMonth, staff, validateSettlement]);

  // ---- the ONE formula --------------------------------------------------------
  const calculation = useMemo(() => {
    if (!inputs) return null;
    return computeSettlement(inputs, {
      incentives: incentivesInput,
      bonus: bonusInput,
      overtimeOverride,
      advanceToAdjust,
    });
  }, [inputs, incentivesInput, bonusInput, overtimeOverride, advanceToAdjust]);

  // STRICT ACCESS CONTROL: settlements need the settlements permission.
  if (!canAccessSettlements) {
    return (
      <EmptyState
        icon={ShieldX}
        title="Access Denied"
        description="Salary settlements contain confidential compensation data and are restricted to the Owner only."
        action={
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        }
      />
    );
  }

  const handleSettleClick = () => {
    if (!calculation) return;
    if (calculation.netPayable === 0) setShowZeroPaymentDialog(true);
    else setShowConfirmDialog(true);
  };

  const handleSettle = async () => {
    if (!calculation || !inputs || !selectedStaffId || !selectedMonth || !user?.id) return;
    if (isAlreadySettled) {
      toast({ title: 'Already Settled', description: 'Salary for this month has already been settled.', variant: 'destructive' });
      return;
    }
    const monthLabel = format(new Date(selectedMonth + '-01'), 'MMMM yyyy');
    try {
      setIsSettling(true);
      await persistGroupSettlement(calculation, {
        staff: inputs.staff,
        month: selectedMonth,
        userId: user.id,
        approverName: getUserDisplayName(user, staffData),
        overtimeOverrideReason: overtimeOverride !== null ? overtimeOverrideReason : null,
      });

      toast({
        title: 'Salary Settled',
        description: `Salary for ${monthLabel} has been recorded. ${calculation.netPayable > 0 ? 'Go to Advance Payouts to execute payment.' : ''}`,
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staffBalance.byStaff(selectedStaffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.byStaff(selectedStaffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.advancesOutstanding.all });

      setSelectedStaffId('');
      setInputs(null);
      setIsAlreadySettled(false);
      setShowConfirmDialog(false);
      setShowZeroPaymentDialog(false);
      if (calculation.netPayable > 0) navigate('/settlements/payouts');
    } catch (error) {
      console.error('Error settling salary:', error);
      toast({
        title: 'Settlement Failed',
        description: error instanceof Error ? error.message : 'Failed to settle salary. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSettling(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  }).filter((m) => m.value <= format(new Date(), 'yyyy-MM'));

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);
  const canSettle = calculation && !isAlreadySettled && !isSheetLocked && validation?.valid !== false;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader title="Single Settlement" description="Settle one salary — the grid on Process Payroll is the main flow">
        <Button variant="ghost" size="sm" onClick={() => navigate('/payroll/process')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">Process Payroll</span>
        </Button>
      </PageHeader>

      {selectedMonth && (
        <PayrollDataIntegrityBanner
          from={format(parseISO(selectedMonth + '-01'), 'yyyy-MM-dd')}
          to={format(new Date(parseISO(selectedMonth + '-01').getFullYear(), parseISO(selectedMonth + '-01').getMonth() + 1, 0), 'yyyy-MM-dd')}
        />
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Selection Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Settlement Details</CardTitle>
            <CardDescription>Select staff and month to settle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Staff *</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} ({s.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Settlement Month *</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isAlreadySettled && (
              <Alert className="border-warning bg-warning/10">
                <Lock className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning flex items-center justify-between gap-3">
                  <span>Salary for this month is already settled and cannot be modified.</span>
                  {selectedStaff && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={async () => {
                        const { data, error } = await supabase
                          .from('salary_settlements')
                          .select('*')
                          .eq('staff_id', selectedStaffId)
                          .eq('settlement_month', selectedMonth)
                          .maybeSingle();
                        if (error || !data) {
                          toast({ title: 'Error', description: 'Could not load settlement for payslip', variant: 'destructive' });
                          return;
                        }
                        await downloadPayslipPDF(selectedStaff as never, data as never);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Payslip
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {isSheetLocked && (
              <Alert className="border-warning bg-warning/10">
                <Lock className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  The salary sheet for this month is locked. Settlements cannot be added or changed until it is unlocked from Process Payroll.
                </AlertDescription>
              </Alert>
            )}

            {validation && !validation.valid && !isAlreadySettled && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{validation.error}</AlertDescription>
              </Alert>
            )}

            <Separator />

            {/* Advance adjustment (if advances exist) */}
            {calculation && calculation.advancesOutstanding > 0 && !isAlreadySettled && (
              <AdvanceAdjustmentInput
                totalAdvanceOutstanding={calculation.advancesOutstanding}
                grossSalary={calculation.grossSalary}
                adjustmentAmount={calculation.advanceToAdjust}
                onAdjustmentChange={(amount) => setAdvanceToAdjust(Math.max(0, amount))}
                disabled={isAlreadySettled}
              />
            )}

            {/* Monthly variables */}
            {calculation && !isAlreadySettled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Incentives</Label>
                  <Input type="number" min="0" value={incentivesInput || ''} placeholder="0"
                    onChange={(e) => setIncentivesInput(toAmount(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bonus</Label>
                  <Input type="number" min="0" value={bonusInput || ''} placeholder="0"
                    onChange={(e) => setBonusInput(toAmount(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Overtime (auto ₹{calculation.overtimeAuto.toFixed(0)})</Label>
                  <Input type="number" min="0" value={overtimeOverride ?? ''} placeholder="auto"
                    onChange={(e) => setOvertimeOverride(e.target.value === '' ? null : toAmount(e.target.value))} />
                </div>
                {overtimeOverride !== null && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Overtime override reason *</Label>
                    <Input value={overtimeOverrideReason} onChange={(e) => setOvertimeOverrideReason(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Payment Mode *</Label>
              <Select
                value={paymentMode}
                onValueChange={(v) => setPaymentMode(v as PaymentMode)}
                disabled={isAlreadySettled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Calculation Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Settlement Calculation
            </CardTitle>
            <CardDescription>
              {selectedStaff ? `For ${selectedStaff.full_name}` : 'Select a staff member'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isCalculating ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !calculation ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calculator className="h-12 w-12 mb-4 opacity-50" />
                <p>Select staff and month to calculate</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-muted-foreground">Monthly Salary (pro-rata)</span>
                  <Amount value={calculation.monthlySalary} className="font-medium" />
                </div>

                {(calculation.incentives > 0 || calculation.bonus > 0 || calculation.overtimeAmount > 0) && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">Incentives + Bonus + Overtime</span>
                    <span className="font-medium text-success">
                      +<Amount value={calculation.incentives + calculation.bonus + calculation.overtimeAmount} />
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-muted-foreground">
                    Leave Deduction ({calculation.finalDeductionDays} days × ₹{calculation.dailySalary.toFixed(2)})
                  </span>
                  <span className="text-destructive font-medium">
                    -<Amount value={calculation.leaveDeduction} />
                  </span>
                </div>

                {calculation.absentDeduction > 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">
                      Absent Days ({calculation.absentDeductionDays} × ₹{calculation.dailySalary.toFixed(2)})
                    </span>
                    <span className="text-destructive font-medium">
                      -<Amount value={calculation.absentDeduction} />
                    </span>
                  </div>
                )}

                <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Attendance:</span>{' '}
                  Present {calculation.presentDays}{calculation.halfDays > 0 ? ` + ${calculation.halfDays} half` : ''} · Paid leave {calculation.paidLeaveDays} · Off {calculation.offDays} · Absent {calculation.absentDays}{calculation.compOffEarned > 0 ? ` · Comp-off +${calculation.compOffEarned}` : ''}
                  <span className="mt-1 block">
                    Wrong attendance? Fix it in <button className="font-medium text-primary underline underline-offset-2" onClick={() => navigate('/bulk-attendance')}>Bulk Attendance Adjustments</button> — this screen has no overrides.
                  </span>
                </div>

                {calculation.disciplineFine > 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">Discipline Fine</span>
                    <span className="text-destructive font-medium">-<Amount value={calculation.disciplineFine} /></span>
                  </div>
                )}

                {calculation.pfEmployee > 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">
                      PF (Employee {calculation.pfRateEmployee}% of ₹{calculation.pfBase.toFixed(0)})
                    </span>
                    <span className="text-destructive font-medium">-<Amount value={calculation.pfEmployee} /></span>
                  </div>
                )}

                {calculation.esiEmployee > 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">
                      ESI (Employee {calculation.esiRateEmployee}% of ₹{calculation.esiBase.toFixed(0)})
                    </span>
                    <span className="text-destructive font-medium">-<Amount value={calculation.esiEmployee} /></span>
                  </div>
                )}

                {calculation.ptAmount > 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">Professional Tax</span>
                    <span className="text-destructive font-medium">-<Amount value={calculation.ptAmount} /></span>
                  </div>
                )}

                {calculation.loanEmiTotal > 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">Loan EMI</span>
                    <span className="text-destructive font-medium">-<Amount value={calculation.loanEmiTotal} /></span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between items-center py-1.5">
                  <span className="font-medium">Gross Salary</span>
                  <Amount value={calculation.grossSalary} className="font-medium" />
                </div>

                {calculation.advancesOutstanding > 0 && (
                  <>
                    <div className="flex justify-between items-center py-1.5 text-sm">
                      <span className="text-muted-foreground">Opening Advance Balance</span>
                      <Amount value={calculation.advancesOutstanding} className="text-warning" />
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-muted-foreground">Advance Adjusted</span>
                      <span className="text-destructive font-medium">-<Amount value={calculation.advanceToAdjust} /></span>
                    </div>
                    {calculation.carryForwardAdvance > 0 && (
                      <div className="flex justify-between items-center py-1.5 text-sm">
                        <span className="text-muted-foreground">Carry Forward</span>
                        <Amount value={calculation.carryForwardAdvance} className="text-warning" />
                      </div>
                    )}
                  </>
                )}

                {calculation.arrears !== 0 && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="font-medium">Arrears {calculation.arrears < 0 ? '(recovery)' : '(back-pay)'}</span>
                    <span className={calculation.arrears < 0 ? 'font-medium text-destructive' : 'font-medium text-success'}>
                      {calculation.arrears < 0 ? '-' : '+'}<Amount value={Math.abs(calculation.arrears)} />
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-4 -mx-4">
                  <span className="font-semibold text-lg">Net Payable</span>
                  <Amount value={calculation.netPayable} size="lg" className="font-bold text-primary" />
                </div>

                {calculation.carryForwardAdvance > 0 && (
                  <Alert className="border-info bg-info/10">
                    <Info className="h-4 w-4 text-info" />
                    <AlertDescription className="text-info">
                      ₹{calculation.carryForwardAdvance.toLocaleString('en-IN')} advance will carry forward to next month.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleSettleClick}
                  disabled={!canSettle || isSettling || (overtimeOverride !== null && !overtimeOverrideReason.trim())}
                  className="w-full mt-4"
                  size="lg"
                >
                  {isSettling ? (
                    'Processing...'
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Settle Salary
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialogs */}
      {calculation && selectedStaff && (
        <>
          <EnhancedSettlementConfirmDialog
            open={showConfirmDialog}
            onOpenChange={setShowConfirmDialog}
            onConfirm={handleSettle}
            isLoading={isSettling}
            staffName={selectedStaff.full_name}
            month={format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
            snapshot={{
              baseSalary: calculation.monthlySalary,
              leaveDays: calculation.finalDeductionDays,
              leaveDeduction: calculation.leaveDeduction,
              grossSalary: calculation.grossSalary,
              openingAdvanceBalance: calculation.advancesOutstanding,
              advanceAdjusted: calculation.advanceToAdjust,
              closingAdvanceBalance: calculation.carryForwardAdvance,
              netPayable: calculation.netPayable,
              systemDeductionDays: calculation.systemDeductionDays,
            }}
            paymentMode={paymentMode}
          />

          <ZeroPaymentConfirmDialog
            open={showZeroPaymentDialog}
            onOpenChange={setShowZeroPaymentDialog}
            onConfirm={handleSettle}
            isLoading={isSettling}
            staffName={selectedStaff.full_name}
            month={format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
            reason={`Advances adjusted (₹${calculation.advanceToAdjust.toLocaleString('en-IN')}) equal gross salary`}
          />
        </>
      )}
    </div>
  );
}
