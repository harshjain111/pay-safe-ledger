import { useState, useEffect, useCallback } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calculator, Check, AlertTriangle, Lock, Info, ShieldX, Download } from 'lucide-react';
import { format, subMonths, getDaysInMonth, parseISO } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { EnhancedSettlementConfirmDialog } from '@/components/settlements/EnhancedSettlementConfirmDialog';
import { ZeroPaymentConfirmDialog } from '@/components/settlements/ZeroPaymentConfirmDialog';
import { AdvanceAdjustmentInput } from '@/components/settlements/AdvanceAdjustmentInput';
import { LeaveDeductionSection } from '@/components/settlements/LeaveDeductionSection';
import { createSalarySettlementEntry } from '@/lib/journal-entries';
import { getMonthlyDisciplineFine } from '@/lib/discipline';
import { downloadPayslipPDF } from '@/lib/payslip-pdf';
import {
  getStaffStructure,
  prorateStructure,
  computeProfessionalTax,
  computeAutoOvertime,
  getLoanEMIsForMonth,
  type LoanEMI,
  type PTSlab,
} from '@/lib/payroll';
import type { Staff, PaymentMode } from '@/types/database';
import { computeDayBreakdown, type DayBreakdown } from '@/lib/attendance-pay';

interface SettlementCalculation {
  monthlySalary: number; // pro-rata contractual (Basic+HRA+Allow)
  basic: number;
  hra: number;
  allowances: number;
  incentives: number;
  bonus: number;
  overtimeAuto: number;
  overtimeAmount: number;
  overtimeOverrideReason: string;
  dailySalary: number;
  systemDeductionDays: number;
  finalDeductionDays: number;
  deductionAdjustmentReason?: string;
  leaveDeduction: number;
  absentDeductionDays: number;
  absentDeduction: number;
  presentDays: number;
  halfDays: number;
  offDays: number;
  paidLeaveDays: number;
  absentDays: number;
  compOffEarned: number;
  attendanceTracked: boolean;
  disciplineFine: number;
  pfEmployee: number;
  pfEmployer: number;
  pfBase: number;
  pfRateEmployee: number;
  pfRateEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  esiBase: number;
  esiRateEmployee: number;
  esiRateEmployer: number;
  esiEligible: boolean;
  ptAmount: number;
  loanEmis: LoanEMI[];
  loanEmiTotal: number;
  grossSalary: number;
  advancesOutstanding: number;
  advanceToAdjust: number;
  netPayable: number;
  carryForwardAdvance: number;
}

interface StatutorySettings {
  pf_enabled: boolean;
  pf_employee_rate: number;
  pf_employer_rate: number;
  pf_base_cap: number;
  esi_enabled: boolean;
  esi_employer_rate: number;
  esi_eligibility_ceiling: number;
  pt_enabled: boolean;
  pt_monthly_amount: number;
  pt_min_gross: number;
  pt_slabs?: PTSlab[] | null;
  ot_enabled?: boolean;
  ot_standard_minutes?: number;
  ot_multiplier?: number;
}

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

// Worked-minute thresholds for classifying a day's attendance.
const FULL_DAY_MINUTES = 480; // >= 8h worked = full present day
const HALF_DAY_MINUTES = 240; // >= 4h worked = half present day

export default function Settlements() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, staffData, canAccessSettlements } = useAuth();
  const queryClient = useQueryClient();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(searchParams.get('staff') || '');
  const [selectedMonth, setSelectedMonth] = useState<string>(searchParams.get('month') || format(subMonths(new Date(), 1), 'yyyy-MM'));
  // Leave deduction state
  const [systemDeductionDays, setSystemDeductionDays] = useState(0);
  const [finalDeductionDays, setFinalDeductionDays] = useState(0);
  const [deductionAdjustmentReason, setDeductionAdjustmentReason] = useState('');
  const [advanceToAdjust, setAdvanceToAdjust] = useState(0);
  const [netPayableOverride, setNetPayableOverride] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [calculation, setCalculation] = useState<SettlementCalculation | null>(null);
  const [isAlreadySettled, setIsAlreadySettled] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showZeroPaymentDialog, setShowZeroPaymentDialog] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statutorySettings, setStatutorySettings] = useState<StatutorySettings | null>(null);

  // New monthly variable inputs
  const [incentivesInput, setIncentivesInput] = useState<number>(0);
  const [bonusInput, setBonusInput] = useState<number>(0);
  const [overtimeOverride, setOvertimeOverride] = useState<number | null>(null);
  const [absentDaysOverride, setAbsentDaysOverride] = useState<number | null>(null);
  const [overtimeOverrideReason, setOvertimeOverrideReason] = useState<string>('');

  const validateSettlement = useCallback(async () => {
    try {
      const { data: settledData } = await supabase
        .rpc('is_salary_settled', {
          _staff_id: selectedStaffId,
          _month: selectedMonth,
        });

      setIsAlreadySettled(settledData);

      const { data: validationData, error } = await supabase
        .rpc('validate_settlement', {
          _staff_id: selectedStaffId,
          _month: selectedMonth,
        });

      if (error) throw error;

      const result = validationData as unknown as ValidationResult;
      setValidation(result);

      const newWarnings: string[] = [];

      if (result.warning) {
        newWarnings.push('Staff is inactive');
      }

      setWarnings(newWarnings);
    } catch (error) {
      console.error('Error validating settlement:', error);
    }
  }, [selectedStaffId, selectedMonth]);

  const calculateSettlement = useCallback(async () => {
    if (!selectedStaffId || !selectedMonth) return;

    try {
      setIsCalculating(true);

      const { data: salaryData, error: salaryError } = await supabase
        .rpc('get_staff_salary_for_month', {
          _staff_id: selectedStaffId,
          _month: selectedMonth,
        });

      if (salaryError) throw salaryError;

      // SAFEGUARD 4: Use journal_lines as single source of truth for advances
      const { data: advanceData, error: advanceError } = await supabase
        .rpc('get_staff_advances_from_journals', {
          _staff_id: selectedStaffId,
        });

      if (advanceError) throw advanceError;

      const monthlySalary = toAmount(salaryData);
      const daysInMonth = getDaysInMonth(parseISO(selectedMonth + '-01'));
      const dailySalary = monthlySalary / daysInMonth;

      // PRO-RATA
      const monthStart = parseISO(selectedMonth + '-01');
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      let effectiveDays = daysInMonth;
      const currentStaff = staff.find(s => s.id === selectedStaffId);
      if (currentStaff) {
        const joiningDate = parseISO(currentStaff.date_of_joining);
        if (joiningDate > monthStart && joiningDate <= monthEnd) {
          effectiveDays = daysInMonth - joiningDate.getDate() + 1;
        }
        // Exit proration: prefer an explicit date_of_leaving; otherwise fall back
        // to the legacy "inactive + updated_at" heuristic for older records that
        // predate the date_of_leaving column.
        if (currentStaff.date_of_leaving) {
          const leavingDate = parseISO(currentStaff.date_of_leaving);
          if (leavingDate < monthStart) {
            effectiveDays = 0;
          } else if (leavingDate <= monthEnd) {
            const exitDay = leavingDate.getDate();
            const joiningDay = (joiningDate > monthStart && joiningDate <= monthEnd) ? joiningDate.getDate() : 1;
            effectiveDays = Math.max(0, exitDay - joiningDay + 1);
          }
        } else if (!currentStaff.is_active) {
          const updatedAt = parseISO(currentStaff.updated_at);
          if (updatedAt >= monthStart && updatedAt <= monthEnd) {
            const exitDay = updatedAt.getDate();
            const joiningDay = (joiningDate > monthStart && joiningDate <= monthEnd) ? joiningDate.getDate() : 1;
            effectiveDays = Math.max(0, exitDay - joiningDay + 1);
          }
        }
      }

      const proRataSalary = dailySalary * effectiveDays;
      const leaveDeduction = dailySalary * finalDeductionDays;

      // Structure breakdown (pro-rated)
      const fullStructure = currentStaff ? getStaffStructure(currentStaff) : { basic: monthlySalary, hra: 0, allowances: 0, contractualTotal: monthlySalary };
      const prorated = prorateStructure(fullStructure, effectiveDays, daysInMonth);

      let disciplineFine = 0;
      const disciplineFinedDates = new Set<string>();
      if (currentStaff && (currentStaff as Staff).attendance_tracked !== false) {
        const { totalFine, logs } = await getMonthlyDisciplineFine(selectedStaffId, selectedMonth, monthlySalary);
        disciplineFine = totalFine;
        // Dates already carrying a late/early fine (not absences); used to avoid
        // docking the attendance shortfall twice on the same day.
        for (const l of logs) {
          if (!l.is_cancelled && !l.is_absent && Number(l.fine_amount) > 0) disciplineFinedDates.add(l.work_date);
        }
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;

      // Attendance-driven pay (item 14): dock unrecorded absences so present / off /
      // paid-leave days drive net pay. This is ADDITIVE to the existing full-month
      // proration and leave deduction — absent days have no session, so there is no
      // overlap with discipline fines (which only apply to days worked).
      const attendanceTracked = !!(currentStaff && (currentStaff as Staff).attendance_tracked !== false);
      let dayBreakdown: DayBreakdown | null = null;
      let absentDeductionDays = 0;
      let compOffEnabled = true;
      if (attendanceTracked && currentStaff) {
        const monthStartStr = format(monthStart, 'yyyy-MM-dd');
        const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
        const [attRes, rosRes, lvRes, rulesRes] = await Promise.all([
          supabase.from('attendance_sessions').select('work_date, worked_minutes, status')
            .eq('staff_id', selectedStaffId).gte('work_date', monthStartStr).lte('work_date', monthEndStr),
          supabase.from('staff_roster').select('roster_date, shift_id, is_off')
            .eq('staff_id', selectedStaffId).gte('roster_date', monthStartStr).lte('roster_date', monthEndStr),
          supabase.from('leave_records').select('leave_date, deduction_days')
            .eq('staff_id', selectedStaffId).eq('status', 'approved')
            .gte('leave_date', monthStartStr).lte('leave_date', monthEndStr),
          supabase.from('hr_pay_rules' as never)
            .select('full_day_minutes, half_day_minutes, unscheduled_is_off, comp_off_enabled').maybeSingle(),
        ]);
        const payRules = (rulesRes.data ?? null) as {
          full_day_minutes?: number; half_day_minutes?: number;
          unscheduled_is_off?: boolean; comp_off_enabled?: boolean;
        } | null;
        compOffEnabled = payRules?.comp_off_enabled ?? true;
        dayBreakdown = computeDayBreakdown({
          monthStart,
          monthEnd,
          dateOfJoining: currentStaff.date_of_joining,
          dateOfLeaving: currentStaff.date_of_leaving ?? null,
          weeklyOffDay: currentStaff.weekly_off_day ?? null,
          fullDayMinutes: payRules?.full_day_minutes ?? FULL_DAY_MINUTES,
          halfDayMinutes: payRules?.half_day_minutes ?? HALF_DAY_MINUTES,
          unscheduledIsOff: payRules?.unscheduled_is_off ?? true,
          disciplineFinedDates,
          attendance: attRes.data ?? [],
          roster: rosRes.data ?? [],
          leaves: lvRes.data ?? [],
        });
        absentDeductionDays = absentDaysOverride !== null ? absentDaysOverride : dayBreakdown.absentDeductionDays;
      }
      const absentDeduction = round2(dailySalary * absentDeductionDays);
      const compOffEarned = compOffEnabled ? (dayBreakdown?.offWorkedDays ?? 0) : 0;

      const s = statutorySettings;
      const cs = currentStaff;

      const pfActive = !!(s?.pf_enabled && cs?.pf_enrolled);
      const pfRateEmployee = pfActive ? toAmount(cs?.pf_employee_rate_override ?? s?.pf_employee_rate) : 0;
      const pfRateEmployer = pfActive ? (s?.pf_employer_rate ?? 0) : 0;
      const pfBase = pfActive ? Math.min(proRataSalary, s?.pf_base_cap ?? proRataSalary) : 0;
      const pfEmployee = pfActive ? round2(pfBase * pfRateEmployee / 100) : 0;
      const pfEmployer = pfActive ? round2(pfBase * pfRateEmployer / 100) : 0;

      const esiEnrolled = !!(s?.esi_enabled && cs?.esi_enrolled);
      const esiBase = proRataSalary;
      const esiEligible = esiEnrolled && esiBase <= (s?.esi_eligibility_ceiling ?? Infinity);
      const esiRateEmployee = esiEligible ? toAmount(cs?.esi_employee_rate) : 0;
      const esiRateEmployer = esiEligible ? (s?.esi_employer_rate ?? 0) : 0;
      const esiEmployee = esiEligible ? round2(esiBase * esiRateEmployee / 100) : 0;
      const esiEmployer = esiEligible ? round2(esiBase * esiRateEmployer / 100) : 0;

      // Auto Overtime — global config (shift length + multiplier) with per-staff override.
      const otEnabled = s?.ot_enabled !== false;
      const otStandardMinutes = (cs as Staff)?.ot_standard_minutes_override ?? s?.ot_standard_minutes ?? 480;
      const otMultiplier = (cs as Staff)?.ot_multiplier_override ?? s?.ot_multiplier ?? 1.5;
      const overtimeAuto = attendanceTracked && otEnabled
        ? await computeAutoOvertime({
            staffId: selectedStaffId,
            month: selectedMonth,
            basic: fullStructure.basic,
            daysInMonth,
            scheduledMinutesPerDay: otStandardMinutes,
            multiplier: otMultiplier,
          })
        : 0;
      const overtimeAmount = overtimeOverride !== null ? overtimeOverride : overtimeAuto;

      // Loan EMIs
      const loanEmis = await getLoanEMIsForMonth(selectedStaffId, selectedMonth);
      const loanEmiTotal = loanEmis.reduce((sum, l) => sum + toAmount(l.amount), 0);

      // Gross earnings before statutory + leave + discipline
      const grossEarnings = proRataSalary + incentivesInput + bonusInput + overtimeAmount;

      // Professional Tax (computed against gross earnings)
      const ptAmount = computeProfessionalTax(currentStaff ?? {}, grossEarnings, s);

      const grossSalary = Math.max(0, grossEarnings - leaveDeduction - absentDeduction - disciplineFine - pfEmployee - esiEmployee - ptAmount);
      const advancesOutstanding = toAmount(advanceData);
      const maxAdjustable = Math.min(advancesOutstanding, Math.max(0, grossSalary - loanEmiTotal));
      const currentAdj = Math.min(advanceToAdjust, maxAdjustable);
      const netPayable = Math.max(0, grossSalary - currentAdj - loanEmiTotal);
      const carryForwardAdvance = advancesOutstanding - currentAdj;

      const newWarnings: string[] = [];
      if (effectiveDays < daysInMonth) newWarnings.push(`Pro-rata: ${effectiveDays} of ${daysInMonth} days`);
      if (finalDeductionDays > 5) newWarnings.push(`High leave deduction (${finalDeductionDays} days)`);
      if (finalDeductionDays > effectiveDays) newWarnings.push(`Leave exceeds working days (${effectiveDays})`);
      if (esiEnrolled && !esiEligible) newWarnings.push(`ESI skipped — gross exceeds ceiling`);
      setWarnings(newWarnings);

      setCalculation({
        monthlySalary: proRataSalary,
        basic: prorated.basic,
        hra: prorated.hra,
        allowances: prorated.allowances,
        incentives: incentivesInput,
        bonus: bonusInput,
        overtimeAuto,
        overtimeAmount,
        overtimeOverrideReason,
        dailySalary,
        systemDeductionDays,
        finalDeductionDays,
        deductionAdjustmentReason,
        leaveDeduction,
        absentDeductionDays,
        absentDeduction,
        presentDays: dayBreakdown?.presentFull ?? 0,
        halfDays: dayBreakdown?.presentHalf ?? 0,
        offDays: dayBreakdown?.offDays ?? 0,
        paidLeaveDays: dayBreakdown?.paidLeaveDays ?? 0,
        absentDays: dayBreakdown?.absentDays ?? 0,
        compOffEarned,
        attendanceTracked,
        disciplineFine,
        pfEmployee, pfEmployer, pfBase, pfRateEmployee, pfRateEmployer,
        esiEmployee, esiEmployer, esiBase, esiRateEmployee, esiRateEmployer, esiEligible,
        ptAmount,
        loanEmis,
        loanEmiTotal,
        grossSalary,
        advancesOutstanding,
        advanceToAdjust: currentAdj,
        netPayable,
        carryForwardAdvance,
      });
    } catch (error) {
      console.error('Error calculating settlement:', error);
      toast({
        title: 'Calculation Error',
        description: 'Failed to calculate settlement. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCalculating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 'advanceToAdjust' intentionally excluded: advance-adjustment changes are handled by the dedicated lightweight effect below to avoid a full DB recalculation.
  }, [selectedStaffId, selectedMonth, staff, finalDeductionDays, statutorySettings, overtimeOverride, absentDaysOverride, incentivesInput, bonusInput, systemDeductionDays, deductionAdjustmentReason, overtimeOverrideReason]);

  useEffect(() => {
    if (canAccessSettlements) {
      fetchStaff();
      fetchStatutorySettings();
    }
  }, [canAccessSettlements]);

  useEffect(() => {
    if (canAccessSettlements && selectedStaffId && selectedMonth) {
      // Reset overrides when staff/month changes
      setAdvanceToAdjust(0);
      setNetPayableOverride(null);
      validateSettlement();
    }
  }, [canAccessSettlements, selectedStaffId, selectedMonth, validateSettlement]);

  // Recalculate when deduction days change OR statutory settings load
  useEffect(() => {
    if (canAccessSettlements && selectedStaffId && selectedMonth) {
      calculateSettlement();
    }
  }, [canAccessSettlements, selectedStaffId, selectedMonth, calculateSettlement]);

  // Recalculate netPayable when advance adjustment changes (without resetting overrides)
  useEffect(() => {
    if (calculation) {
      const loanTotal = calculation.loanEmiTotal || 0;
      const maxAdjustable = Math.min(calculation.advancesOutstanding, Math.max(0, calculation.grossSalary - loanTotal));
      const clampedAdjustment = Math.min(advanceToAdjust, maxAdjustable);
      const netPayable = Math.max(0, calculation.grossSalary - clampedAdjustment - loanTotal);
      const carryForward = calculation.advancesOutstanding - clampedAdjustment;

      setCalculation(prev => prev ? {
        ...prev,
        advanceToAdjust: clampedAdjustment,
        netPayable,
        carryForwardAdvance: carryForward,
      } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 'calculation' is updated inside this effect; including it would cause an infinite update loop. Advance-adjustment changes drive this recalc.
  }, [advanceToAdjust]);

  // STRICT ACCESS CONTROL: Only Owner can access settlements
  if (!canAccessSettlements) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <ShieldX className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Salary settlements contain confidential compensation data and are restricted to the Owner only.
        </p>
        <Button onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const fetchStatutorySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('payroll_statutory_settings')
        .select('pf_enabled, pf_employee_rate, pf_employer_rate, pf_base_cap, esi_enabled, esi_employer_rate, esi_eligibility_ceiling, pt_enabled, pt_monthly_amount, pt_min_gross, pt_slabs, ot_enabled, ot_standard_minutes, ot_multiplier')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) setStatutorySettings(data as unknown as StatutorySettings);
    } catch (error) {
      console.error('Error fetching statutory settings:', error);
    }
  };

  // Handle leave deduction changes from LeaveDeductionSection
  const handleLeaveDeductionChange = (systemDays: number, finalDays: number, reason?: string) => {
    setSystemDeductionDays(systemDays);
    setFinalDeductionDays(finalDays);
    setDeductionAdjustmentReason(reason || '');
  };

  const handleAdvanceAdjustmentChange = (amount: number) => {
    if (!calculation) return;
    
    const maxAdjustable = Math.min(calculation.advancesOutstanding, calculation.grossSalary);
    const clampedAmount = Math.min(maxAdjustable, Math.max(0, amount));
    
    setAdvanceToAdjust(clampedAmount);
    
    // If there's a net payable override active, recalculate deduction based on override
    if (netPayableOverride !== null) {
      const leaveDeduction = Math.max(0, calculation.monthlySalary - clampedAmount - netPayableOverride);
      const dailySalary = calculation.dailySalary;
      const backCalculatedDays = dailySalary > 0 ? Math.round((leaveDeduction / dailySalary) * 100) / 100 : 0;
      setFinalDeductionDays(backCalculatedDays);
    }
  };

  const handleNetPayableOverride = (desiredNetPayable: number) => {
    if (!calculation) return;
    
    const monthlySalary = calculation.monthlySalary;
    const dailySalary = calculation.dailySalary;
    const advanceAdj = advanceToAdjust;
    
    // Clamp desired net payable between 0 and (monthlySalary - advanceAdj)
    const maxNetPayable = Math.max(0, monthlySalary - advanceAdj);
    const clampedNet = Math.min(maxNetPayable, Math.max(0, desiredNetPayable));
    
    setNetPayableOverride(clampedNet);
    
    // Formula: deduction = monthlySalary - advanceAdj - desiredNetPayable
    const leaveDeduction = Math.max(0, monthlySalary - advanceAdj - clampedNet);
    const backCalculatedDays = dailySalary > 0 ? Math.round((leaveDeduction / dailySalary) * 100) / 100 : 0;
    
    // Update deduction days (this triggers recalculation)
    setFinalDeductionDays(backCalculatedDays);
  };

  const handleSettleClick = () => {
    if (!calculation) return;

    const daysInMonth = getDaysInMonth(parseISO(selectedMonth + '-01'));
    
    // VALIDATION 1: Leave days must be reasonable
    if (finalDeductionDays < 0) {
      toast({
        title: 'Invalid Leave Days',
        description: 'Leave deduction days cannot be negative.',
        variant: 'destructive',
      });
      return;
    }

    // VALIDATION 2: Advance adjustment cannot exceed outstanding advance
    if (calculation.advanceToAdjust > calculation.advancesOutstanding) {
      toast({
        title: 'Invalid Advance Adjustment',
        description: 'Advance adjustment cannot exceed outstanding advance balance.',
        variant: 'destructive',
      });
      return;
    }

    // VALIDATION 3: Advance adjustment cannot exceed gross salary
    if (calculation.advanceToAdjust > calculation.grossSalary) {
      toast({
        title: 'Invalid Advance Adjustment',
        description: 'Advance adjustment cannot exceed gross salary.',
        variant: 'destructive',
      });
      return;
    }

    // VALIDATION 4: Net payable must reconcile correctly
    const expectedNetPayable = calculation.grossSalary - calculation.advanceToAdjust;
    if (Math.abs(calculation.netPayable - expectedNetPayable) > 0.01) {
      toast({
        title: 'Calculation Error',
        description: `Net payable (₹${calculation.netPayable}) does not match expected (₹${expectedNetPayable}). Please refresh and try again.`,
        variant: 'destructive',
      });
      console.error('Settlement validation failed:', {
        grossSalary: calculation.grossSalary,
        advanceToAdjust: calculation.advanceToAdjust,
        netPayable: calculation.netPayable,
        expectedNetPayable,
      });
      return;
    }

    // VALIDATION 5: Carry-forward must reconcile
    const expectedCarryForward = calculation.advancesOutstanding - calculation.advanceToAdjust;
    if (Math.abs(calculation.carryForwardAdvance - expectedCarryForward) > 0.01) {
      toast({
        title: 'Calculation Error',
        description: 'Carry-forward advance does not reconcile. Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    if (calculation.netPayable === 0) {
      setShowZeroPaymentDialog(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  const handleSettle = async () => {
    if (!calculation || !selectedStaffId || !selectedMonth || !user?.id) return;

    if (isAlreadySettled) {
      toast({
        title: 'Already Settled',
        description: 'Salary for this month has already been settled.',
        variant: 'destructive',
      });
      return;
    }

    const staffName = selectedStaff?.full_name || 'Unknown';
    const monthLabel = format(new Date(selectedMonth + '-01'), 'MMMM yyyy');

    try {
      setIsSettling(true);

      // ========================================
      // DOUBLE-ENTRY ACCOUNTING: SALARY SETTLEMENT
      // ========================================
      // This creates the ACCRUAL entries (no cash movement):
      // 1. Debit: Salary Expense (P&L)
      // 2. Credit: Staff Payable (creates liability)
      // 3. If advance adjustment:
      //    - Debit: Staff Payable (reduce liability)
      //    - Credit: Staff Advances (reduce receivable)
      
      // Step 1: Create journal entry for salary settlement
      const journalEntryId = await createSalarySettlementEntry({
        staffId: selectedStaffId,
        staffName,
        settlementMonth: monthLabel,
        grossSalary: calculation.grossSalary,
        leaveDeduction: calculation.leaveDeduction,
        advanceAdjustment: calculation.advanceToAdjust,
        pfEmployee: calculation.pfEmployee,
        pfEmployer: calculation.pfEmployer,
        esiEmployee: calculation.esiEmployee,
        esiEmployer: calculation.esiEmployer,
        ptAmount: calculation.ptAmount,
        loanEmiTotal: calculation.loanEmiTotal,
        bonus: calculation.bonus,
        overtimeAmount: calculation.overtimeAmount,
        settlementId: '',
        createdBy: user.id,
      });

      // Step 2: Create settlement record linking to journal entry
      const { data: settlementRecord, error: settlementError } = await supabase
        .from('salary_settlements')
        .insert({
          staff_id: selectedStaffId,
          settlement_month: selectedMonth,
          base_salary: calculation.monthlySalary,
          leave_days: calculation.finalDeductionDays,
          leave_deduction: calculation.leaveDeduction,
          absent_deduction_days: calculation.absentDeductionDays,
          absent_deduction: calculation.absentDeduction,
          present_days: calculation.presentDays,
          half_days: calculation.halfDays,
          off_days: calculation.offDays,
          paid_leave_days: calculation.paidLeaveDays,
          absent_days: calculation.absentDays,
          absent_days_override: calculation.attendanceTracked ? absentDaysOverride : null,
          comp_off_earned: calculation.compOffEarned,
          net_salary: calculation.grossSalary,
          advances_adjusted: calculation.advanceToAdjust,
          opening_advance_balance: calculation.advancesOutstanding,
          closing_advance_balance: calculation.carryForwardAdvance,
          balance_payable: calculation.netPayable,
          status: 'settled',
          settled_at: new Date().toISOString(),
          settled_by: user.id,
          journal_entry_id: journalEntryId, // Link to double-entry journal
          system_deduction_days: calculation.systemDeductionDays,
          final_deduction_days: calculation.finalDeductionDays,
          deduction_adjustment_reason: calculation.deductionAdjustmentReason || null,
          deduction_adjusted_by: calculation.finalDeductionDays !== calculation.systemDeductionDays ? user.id : null,
          deduction_adjusted_at: calculation.finalDeductionDays !== calculation.systemDeductionDays ? new Date().toISOString() : null,
          discipline_fine: calculation.disciplineFine,
          pf_employee: calculation.pfEmployee,
          pf_employer: calculation.pfEmployer,
          esi_employee: calculation.esiEmployee,
          esi_employer: calculation.esiEmployer,
          pf_rate_employee: calculation.pfRateEmployee || null,
          pf_rate_employer: calculation.pfRateEmployer || null,
          esi_rate_employee: calculation.esiRateEmployee || null,
          esi_rate_employer: calculation.esiRateEmployer || null,
          pf_base: calculation.pfBase || null,
          esi_base: calculation.esiBase || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Step 3: Update journal entry with settlement reference
      await supabase
        .from('journal_entries')
        .update({ reference_id: settlementRecord.id })
        .eq('id', journalEntryId);

      // Step 4: Mark journal entry as immutable
      await supabase
        .from('journal_entries')
        .update({ is_immutable: true })
        .eq('id', journalEntryId);

      // Step 5: Create salary payout request (if net payable > 0)
      // This will appear in Payouts page for Owner to execute
      // The PAYOUT will create the second journal entry:
      // - Debit: Staff Payable (clear liability)
      // - Credit: Bank/Cash (money out)
      if (calculation.netPayable > 0) {
        const approverName = getUserDisplayName(user, staffData);
        const { error: payoutRequestError } = await supabase
          .from('payment_requests')
          .insert({
            staff_id: selectedStaffId,
            requested_by: user.id,
            amount: calculation.netPayable,
            reason: `Salary for ${monthLabel}`,
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            approved_by_user_name: approverName,
            payout_type: 'salary',
            settlement_id: settlementRecord.id,
          });

        if (payoutRequestError) throw payoutRequestError;
      }
      // Mark leave records for this month as immutable
      const monthStart = format(parseISO(selectedMonth + '-01'), 'yyyy-MM-dd');
      const monthEnd = format(new Date(parseISO(selectedMonth + '-01').getFullYear(), parseISO(selectedMonth + '-01').getMonth() + 1, 0), 'yyyy-MM-dd');
      
      await supabase
        .from('leave_records')
        .update({ is_immutable: true })
        .eq('staff_id', selectedStaffId)
        .eq('status', 'approved')
        .gte('leave_date', monthStart)
        .lte('leave_date', monthEnd);

      toast({
        title: 'Salary Settled',
        description: `Salary for ${monthLabel} has been recorded. ${calculation.netPayable > 0 ? 'Go to Payouts to execute payment.' : ''}`,
      });

      // Refresh balance-derived views now that the settlement changed payable/advance balances
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staffBalance.byStaff(selectedStaffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.byStaff(selectedStaffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.advancesOutstanding.all });

      // Reset form
      setSelectedStaffId('');
      setSystemDeductionDays(0);
      setFinalDeductionDays(0);
      setDeductionAdjustmentReason('');
      setAdvanceToAdjust(0);
      setNetPayableOverride(null);
      setCalculation(null);
      setIsAlreadySettled(false);
      setShowConfirmDialog(false);
      setShowZeroPaymentDialog(false);
      
      // Navigate to payouts if there's something to pay
      if (calculation.netPayable > 0) {
        navigate('/payouts');
      }
    } catch (error: any) {
      console.error('Error settling salary:', error);
      toast({
        title: 'Settlement Failed',
        description: error.message || 'Failed to settle salary. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSettling(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy'),
    };
  }).filter(m => m.value <= format(new Date(), 'yyyy-MM'));

  const selectedStaff = staff.find(s => s.id === selectedStaffId);
  const daysInMonth = selectedMonth ? getDaysInMonth(parseISO(selectedMonth + '-01')) : 30;
  const canSettle = calculation && !isAlreadySettled && validation?.valid !== false && finalDeductionDays >= 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Salary Settlement"
        description="Process monthly settlements"
      >
        <Button variant="ghost" size="sm" onClick={() => navigate('/salaries-advances')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </PageHeader>

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
                        await downloadPayslipPDF(selectedStaff as any, data as any);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Payslip
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {validation && !validation.valid && !isAlreadySettled && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{validation.error}</AlertDescription>
              </Alert>
            )}

            {warnings.length > 0 && validation?.valid && (
              <Alert className="border-warning bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            {/* Step 1: Advance Adjustment (if advances exist) */}
            {calculation && calculation.advancesOutstanding > 0 && !isAlreadySettled && (
              <AdvanceAdjustmentInput
                totalAdvanceOutstanding={calculation.advancesOutstanding}
                grossSalary={calculation.grossSalary}
                adjustmentAmount={calculation.advanceToAdjust}
                onAdjustmentChange={handleAdvanceAdjustmentChange}
                disabled={isAlreadySettled}
              />
            )}

            {/* Step 2: Leave Deduction Section */}
            {selectedStaffId && selectedMonth && !isAlreadySettled && (
              <LeaveDeductionSection
                staffId={selectedStaffId}
                month={selectedMonth}
                dailySalary={calculation?.dailySalary || 0}
                onDeductionChange={handleLeaveDeductionChange}
                disabled={isAlreadySettled}
              />
            )}

            {/* Step 3: Desired Net Payable Override */}
            {calculation && !isAlreadySettled && (
              <div className="space-y-2 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Desired Net Payable (Optional)</Label>
                  <Badge variant="outline" className="text-xs">Override</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the exact amount you want to pay. Leave deduction will be auto-calculated using: 
                  <span className="font-mono text-[10px] block mt-1">Salary − Advance Adj − Deduction = Net Payable</span>
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min="0"
                    max={Math.max(0, calculation.monthlySalary - advanceToAdjust)}
                    value={netPayableOverride !== null ? netPayableOverride : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setNetPayableOverride(null);
                        // Recalculate with original leave days
                        calculateSettlement();
                      } else {
                        handleNetPayableOverride(toAmount(val));
                      }
                    }}
                    className="pl-8 font-mono"
                    placeholder={`Auto: ₹${calculation.netPayable.toLocaleString('en-IN')}`}
                  />
                </div>
                {netPayableOverride !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <Info className="h-3 w-3" />
                      <span>
                        Leave deduction auto-set to {finalDeductionDays} days (₹{(calculation.dailySalary * finalDeductionDays).toFixed(0)})
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                      ₹{calculation.monthlySalary.toFixed(0)} − ₹{advanceToAdjust.toFixed(0)} − ₹{(calculation.dailySalary * finalDeductionDays).toFixed(0)} = ₹{netPayableOverride.toFixed(0)}
                    </div>
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
            {!calculation ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calculator className="h-12 w-12 mb-4 opacity-50" />
                <p>Select staff and month to calculate</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Monthly Salary</span>
                  <Amount value={calculation.monthlySalary} className="font-medium" />
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">
                    Leave Deduction ({calculation.finalDeductionDays} days × ₹{calculation.dailySalary.toFixed(2)})
                  </span>
                  <span className="text-destructive font-medium">
                    -<Amount value={calculation.leaveDeduction} />
                  </span>
                </div>

                {calculation.absentDeduction > 0 && (
                  <div className="flex justify-between items-center py-2">
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
                  <div className="mt-2 flex items-center gap-2">
                    <Label className="text-[11px]">Override absent days</Label>
                    <Input
                      type="number"
                      step="0.5"
                      className="h-7 w-24 text-xs"
                      placeholder="auto"
                      value={absentDaysOverride ?? ''}
                      onChange={(e) => setAbsentDaysOverride(e.target.value === '' ? null : toAmount(e.target.value))}
                    />
                    {absentDaysOverride !== null && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAbsentDaysOverride(null)}>
                        Reset
                      </Button>
                    )}
                  </div>
                </div>

                {calculation.disciplineFine > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Discipline Fine</span>
                    <span className="text-destructive font-medium">
                      -<Amount value={calculation.disciplineFine} />
                    </span>
                  </div>
                )}

                {calculation.pfEmployee > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">
                      PF (Employee {calculation.pfRateEmployee}% of ₹{calculation.pfBase.toFixed(0)})
                    </span>
                    <span className="text-destructive font-medium">
                      -<Amount value={calculation.pfEmployee} />
                    </span>
                  </div>
                )}

                {calculation.esiEmployee > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">
                      ESI (Employee {calculation.esiRateEmployee}% of ₹{calculation.esiBase.toFixed(0)})
                    </span>
                    <span className="text-destructive font-medium">
                      -<Amount value={calculation.esiEmployee} />
                    </span>
                  </div>
                )}
                
                <Separator />
                
                <div className="flex justify-between items-center py-2">
                  <span className="font-medium">Gross Salary</span>
                  <Amount value={calculation.grossSalary} className="font-medium" />
                </div>
                
                {calculation.advancesOutstanding > 0 && (
                  <>
                    <div className="flex justify-between items-center py-2 text-sm">
                      <span className="text-muted-foreground">Opening Advance Balance</span>
                      <Amount value={calculation.advancesOutstanding} className="text-warning" />
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-muted-foreground">Advance Adjusted</span>
                      <span className="text-destructive font-medium">
                        -<Amount value={calculation.advanceToAdjust} />
                      </span>
                    </div>
                    {calculation.carryForwardAdvance > 0 && (
                      <div className="flex justify-between items-center py-2 text-sm">
                        <span className="text-muted-foreground">Carry Forward</span>
                        <Amount value={calculation.carryForwardAdvance} className="text-warning" />
                      </div>
                    )}
                  </>
                )}
                
                <Separator />
                
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
                  disabled={!canSettle || isSettling}
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
