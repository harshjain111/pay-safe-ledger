 import { useState, useEffect } from 'react';
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
 import type { LeaveType } from '@/types/leave';
 import { LEAVE_TYPE_CONFIG } from '@/types/leave';
 
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
   const [leaveType, setLeaveType] = useState<LeaveType>('unpaid');
   const [deductionDays, setDeductionDays] = useState(1);
   const [remarks, setRemarks] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);
 
   const isStaff = userRole === 'staff';
   const canSetDeduction = userRole === 'owner' || userRole === 'admin' || userRole === 'accountant';
 
   useEffect(() => {
     if (open && !isStaff) {
       fetchStaff();
     }
   }, [open, isStaff]);
 
   useEffect(() => {
     if (staffId) {
       setSelectedStaffId(staffId);
     }
   }, [staffId]);
 
   // Update deduction days when leave type changes (for non-custom types)
   useEffect(() => {
    if (leaveType !== 'custom' && !isStaff) {
       setDeductionDays(LEAVE_TYPE_CONFIG[leaveType].defaultDeduction);
     }
  }, [leaveType, isStaff]);
 
   const fetchStaff = async () => {
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
   };
 
   const handleSubmit = async () => {
     if (!leaveDate) {
       toast({
         title: 'Validation Error',
         description: 'Please select a leave date.',
         variant: 'destructive',
       });
       return;
     }
 
     const targetStaffId = isStaff ? staffId : selectedStaffId;
 
     if (!targetStaffId) {
       toast({
         title: 'Validation Error',
         description: 'Please select a staff member.',
         variant: 'destructive',
       });
       return;
     }
 
    // Staff must provide a reason
    if (isStaff && !remarks.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a reason for your leave request.',
        variant: 'destructive',
      });
      return;
    }

     try {
       setIsSubmitting(true);
 
       // Staff can only create pending requests
       // Admins/Accountants/Owners can create and set deduction
       const insertData = {
         staff_id: targetStaffId,
         leave_date: format(leaveDate, 'yyyy-MM-dd'),
        leave_type: isStaff ? 'unpaid' as LeaveType : leaveType, // Staff requests default to unpaid, decided during approval
         deduction_days: canSetDeduction ? deductionDays : LEAVE_TYPE_CONFIG[leaveType].defaultDeduction,
         status: isStaff ? 'pending' as const : 'approved' as const, // Admin/Accountant/Owner can directly approve
         remarks: remarks || undefined,
         created_by: user?.id,
         approved_by: !isStaff ? user?.id : undefined,
         approved_at: !isStaff ? new Date().toISOString() : undefined,
       };
 
       const { error } = await supabase
         .from('leave_records')
         .insert([insertData]);
 
       if (error) {
         if (error.code === '23505') { // Unique constraint violation
           throw new Error('A leave record already exists for this date.');
         }
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
     } catch (error: any) {
       console.error('Error creating leave record:', error);
       toast({
         title: 'Error',
         description: error.message || 'Failed to create leave record.',
         variant: 'destructive',
       });
     } finally {
       setIsSubmitting(false);
     }
   };
 
   const resetForm = () => {
     setSelectedStaffId(staffId || '');
     setLeaveDate(undefined);
     setLeaveType('unpaid');
     setDeductionDays(1);
     setRemarks('');
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
          <DialogTitle>{isStaff ? 'Request Time Off' : 'Record Leave'}</DialogTitle>
           <DialogDescription>
             {isStaff 
              ? 'Submit your leave request for manager approval.' 
               : 'Record a leave entry for a staff member.'}
           </DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4 py-4">
           {/* Staff Selection (not shown for staff users) */}
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
 
           {/* Leave Date */}
           <div className="space-y-2">
             <Label>Leave Date *</Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button
                   variant="outline"
                   className={cn(
                     'w-full justify-start text-left font-normal',
                     !leaveDate && 'text-muted-foreground'
                   )}
                 >
                   <CalendarIcon className="mr-2 h-4 w-4" />
                   {leaveDate ? format(leaveDate, 'PPP') : 'Pick a date'}
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0" align="start">
                 <Calendar
                   mode="single"
                   selected={leaveDate}
                   onSelect={setLeaveDate}
                   initialFocus
                 />
               </PopoverContent>
             </Popover>
           </div>
 
          {/* Leave Type - Only shown for Admin/Accountant/Owner */}
          {!isStaff && (
            <div className="space-y-2">
              <Label>Leave Type *</Label>
              <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex flex-col">
                        <span>{config.label}</span>
                        <span className="text-xs text-muted-foreground">{config.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
 
           {/* Deduction Days (only for admins/accountants/owners) */}
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
                 disabled={leaveType !== 'custom'}
               />
               {leaveType !== 'custom' && (
                 <p className="text-xs text-muted-foreground">
                   Deduction is preset for {LEAVE_TYPE_CONFIG[leaveType].label}. Choose "Custom" to set manually.
                 </p>
               )}
             </div>
           )}
 
           {/* Remarks */}
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