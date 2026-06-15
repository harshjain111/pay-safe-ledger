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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn, toAmount } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
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
  const { user, userRole } = useAuth();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(staffId || '');
  const [leaveDate, setLeaveDate] = useState<Date>();
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeRow[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [deductionDays, setDeductionDays] = useState(1);
  const [typeBalance, setTypeBalance] = useState<{ used: number; accrued: number; balance: number } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStaff = userRole === 'staff';
  const canSetDeduction = userRole === 'owner' || userRole === 'admin' || userRole === 'accountant';

  const targetStaffId = isStaff ? staffId : selectedStaffId;
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
    if (!leaveDate) {
      toast({ title: 'Validation Error', description: 'Please select a leave date.', variant: 'destructive' });
      return;
    }
    if (!targetStaffId) {
      toast({ title: 'Validation Error', description: 'Please select a staff member.', variant: 'destructive' });
      return;
    }
    if (!selectedType) {
      toast({ title: 'Validation Error', description: 'Please select a leave type.', variant: 'destructive' });
      return;
    }
    if (isStaff && !remarks.trim()) {
      toast({ title: 'Validation Error', description: 'Please provide a reason for your leave request.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);

      const deduction = canSetDeduction ? deductionDays : selectedType.default_deduction;
      const insertData = {
        staff_id: targetStaffId,
        leave_date: format(leaveDate, 'yyyy-MM-dd'),
        leave_type_id: selectedType.id,
        // Keep the legacy enum in sync for back-compat (paid vs salary-impacting).
        leave_type: (selectedType.is_paid ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
        deduction_days: deduction,
        status: isStaff ? ('pending' as const) : ('approved' as const),
        remarks: remarks || undefined,
        created_by: user?.id,
        approved_by: !isStaff ? user?.id : undefined,
        approved_at: !isStaff ? new Date().toISOString() : undefined,
      };

      const { error } = await supabase.from('leave_records').insert([insertData]);
      if (error) {
        if (error.code === '23505') throw new Error('A leave record already exists for this date.');
        throw error;
      }

      toast({
        title: isStaff ? 'Leave Request Submitted' : 'Leave Recorded',
        description: isStaff
          ? 'Your leave request has been submitted for approval.'
          : 'Leave record has been created and approved.',
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
    setLeaveDate(undefined);
    setRemarks('');
    const def = leaveTypes.find((t) => t.is_default) ?? leaveTypes[0];
    setSelectedTypeId(def?.id ?? '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isStaff ? 'Request Time Off' : 'Record Leave'}</DialogTitle>
          <DialogDescription>
            {isStaff ? 'Submit your leave request for manager approval.' : 'Record a leave entry for a staff member.'}
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
            <Label>Leave Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !leaveDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {leaveDate ? format(leaveDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={leaveDate} onSelect={setLeaveDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* Leave Type */}
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
