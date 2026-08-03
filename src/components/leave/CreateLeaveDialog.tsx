import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, eachDayOfInterval } from 'date-fns';
import { cn, toAmount } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { NotificationEvents } from '@/lib/notifications';
import { fetchLeaveTypes, computeLeaveBalancesForStaff, type LeaveTypeRow } from '@/lib/leave';

interface CreateLeaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  staffId?: string; // Pre-selected staff (for staff's own requests)
}

interface StaffOption {
  id: string;
  full_name: string;
  employee_id: string;
}

export function CreateLeaveDialog({
  open,
  onOpenChange,
  onSuccess,
  staffId,
}: CreateLeaveDialogProps) {
  const { user, userRole, isAccountant, accountingMode, staffData } = useAuth();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(staffId || '');
  const [range, setRange] = useState<DateRange | undefined>();
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeRow[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [deductionDays, setDeductionDays] = useState(1);
  const [typeBalance, setTypeBalance] = useState<{ used: number; accrued: number; balance: number } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStaff = userRole === 'staff';
  // Personal self-request context: a staff member, or an accountant/admin who has
  // switched to "My Account". These are submitted to the owner as PENDING (never
  // self-approved), and the person requests only for themselves.
  const isPersonalRequest = isStaff || (isAccountant && !accountingMode);
  const canSetDeduction = !isPersonalRequest && (userRole === 'owner' || userRole === 'admin' || userRole === 'accountant');

  const targetStaffId = isPersonalRequest ? staffId : selectedStaffId;
  const selectedType = leaveTypes.find((t) => t.id === selectedTypeId) ?? null;

  const fetchStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, full_name, employee_id')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }, []);

  // Load staff + leave types when the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (!isStaff) fetchStaff();
    (async () => {
      const types = await fetchLeaveTypes(true);
      setLeaveTypes(types);
      // Default to the org default type, else the first active one.
      const def = types.find((t) => t.is_default) ?? types[0];
      if (def) setSelectedTypeId((prev) => prev || def.id);
    })();
  }, [open, isStaff, fetchStaff]);

  useEffect(() => {
    if (staffId) setSelectedStaffId(staffId);
  }, [staffId]);

  // Selecting a type pre-fills its per-day deduction.
  useEffect(() => {
    if (selectedType) setDeductionDays(selectedType.default_deduction);
  }, [selectedTypeId, selectedType]);

  // Show the staff member's current balance for the selected type.
  useEffect(() => {
    let cancelled = false;
    if (!open || !targetStaffId || !selectedTypeId) {
      setTypeBalance(null);
      return;
    }
    (async () => {
      const balances = await computeLeaveBalancesForStaff(targetStaffId, new Date().getFullYear());
      if (cancelled) return;
      const b = balances.find((x) => x.type.id === selectedTypeId);
      setTypeBalance(b ? { used: b.used, accrued: b.accrued, balance: b.balance } : null);
    })();
    return () => { cancelled = true; };
  }, [open, targetStaffId, selectedTypeId]);

  const handleSubmit = async () => {
    if (!range?.from) {
      toast({ title: 'Validation Error', description: 'Please select your leave date(s).', variant: 'destructive' });
      return;
    }
    if (!targetStaffId) {
      toast({ title: 'Validation Error', description: 'Please select a staff member.', variant: 'destructive' });
      return;
    }
    // Personal requests don't choose a type — the approver assigns it. Management
    // recording (on someone's behalf) still requires a type up front.
    if (!isPersonalRequest && !selectedType) {
      toast({ title: 'Validation Error', description: 'Please select a leave type.', variant: 'destructive' });
      return;
    }
    if (isPersonalRequest && !remarks.trim()) {
      toast({ title: 'Validation Error', description: 'Please provide a reason for your leave request.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);

      const from = range.from;
      const to = range.to ?? range.from;
      const days = eachDayOfInterval({ start: from, end: to });
      const fromStr = format(from, 'yyyy-MM-dd');
      const toStr = format(to, 'yyyy-MM-dd');

      // Skip dates that already have a leave record for this person.
      const { data: existing } = await supabase
        .from('leave_records')
        .select('leave_date')
        .eq('staff_id', targetStaffId)
        .gte('leave_date', fromStr)
        .lte('leave_date', toStr);
      const taken = new Set((existing ?? []).map((r) => (r as { leave_date: string }).leave_date));

      const rows = days
        .map((d) => format(d, 'yyyy-MM-dd'))
        .filter((d) => !taken.has(d))
        .map((d) =>
          isPersonalRequest
            ? {
                // Type + deduction are left for the approver (manager/admin/owner).
                staff_id: targetStaffId,
                leave_date: d,
                leave_type_id: null,
                deduction_days: 0,
                status: 'pending' as const,
                remarks: remarks || undefined,
                created_by: user?.id,
              }
            : {
                staff_id: targetStaffId,
                leave_date: d,
                leave_type_id: selectedType!.id,
                // Keep the legacy enum in sync for back-compat (paid vs salary-impacting).
                leave_type: (selectedType!.is_paid ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
                deduction_days: canSetDeduction ? deductionDays : selectedType!.default_deduction,
                status: 'approved' as const,
                remarks: remarks || undefined,
                created_by: user?.id,
                approved_by: user?.id,
                approved_at: new Date().toISOString(),
              },
        );

      if (rows.length === 0) {
        toast({ title: 'Already recorded', description: 'Leave already exists for the selected date(s).', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase.from('leave_records').insert(rows);
      if (error) {
        if (error.code === '23505') throw new Error('A leave record already exists for one of these dates.');
        throw error;
      }

      const rangeLabel = days.length === 1
        ? format(from, 'dd MMM yyyy')
        : `${format(from, 'dd MMM')} – ${format(to, 'dd MMM yyyy')} (${rows.length} day${rows.length === 1 ? '' : 's'})`;

      // Personal self-requests go to the owner for approval — notify them.
      if (isPersonalRequest) {
        await NotificationEvents.leaveRequested(staffData?.full_name || 'A team member', rangeLabel);
      }

      toast({
        title: isPersonalRequest ? 'Leave Request Submitted' : 'Leave Recorded',
        description: isPersonalRequest
          ? `Your leave request (${rangeLabel}) has been submitted to the owner for approval.`
          : `Leave recorded for ${rangeLabel}.`,
      });

      onSuccess();
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating leave record:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create leave record.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedStaffId(staffId || '');
    setRange(undefined);
    setRemarks('');
    const def = leaveTypes.find((t) => t.is_default) ?? leaveTypes[0];
    setSelectedTypeId(def?.id ?? '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isPersonalRequest ? 'Request Time Off' : 'Record Leave'}</DialogTitle>
          <DialogDescription>
            {isPersonalRequest ? 'Submit your leave request — your approver sets the type.' : 'Record a leave entry for a staff member.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!isStaff && (
            <div className="space-y-2">
              <Label>Staff Member *</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
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
          )}

          <div className="space-y-2">
            <Label>Leave Dates *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !range?.from && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {range?.from
                    ? range.to && range.to.getTime() !== range.from.getTime()
                      ? `${format(range.from, 'PPP')} → ${format(range.to, 'PPP')}`
                      : format(range.from, 'PPP')
                    : 'Pick a date or range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={1} initialFocus />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Pick a single day, or a start and end date for multiple days.</p>
          </div>

          {/* Leave Type — only when recording on someone's behalf. Personal
              requests are typed by the approver (manager/admin/owner). */}
          {!isPersonalRequest && (
          <div className="space-y-2">
            <Label>Leave Type *</Label>
            <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex flex-col">
                      <span>{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.is_paid ? 'Paid — no deduction' : `Unpaid — ${t.default_deduction}d/day deduction`}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeBalance && selectedType && (
              <p className="text-xs text-muted-foreground">
                {selectedType.accrual === 'none'
                  ? `${typeBalance.used} used this year`
                  : `Balance: ${typeBalance.balance} day${typeBalance.balance === 1 ? '' : 's'} (used ${typeBalance.used} of ${typeBalance.accrued})`}
              </p>
            )}
          </div>
          )}

          {isPersonalRequest && (
            <p className="text-xs text-muted-foreground">
              Your approver will set the leave type when reviewing this request.
            </p>
          )}

          {/* Deduction Days (admins/accountants/owners) */}
          {canSetDeduction && (
            <div className="space-y-2">
              <Label>Deduction Days</Label>
              <Input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={deductionDays}
                onChange={(e) => setDeductionDays(toAmount(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to the {selectedType?.name ?? 'type'}’s rule; adjust if needed.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{isStaff ? 'Reason *' : 'Remarks (Optional)'}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={isStaff ? 'Please explain your reason for leave...' : 'Reason for leave...'}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : isStaff ? 'Request Leave' : 'Record Leave'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
