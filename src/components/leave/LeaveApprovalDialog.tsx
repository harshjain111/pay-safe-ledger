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
 import { Separator } from '@/components/ui/separator';
 import { Badge } from '@/components/ui/badge';
 import { CheckCircle, XCircle, Calendar, User } from 'lucide-react';
 import { format } from 'date-fns';
 import { toast } from '@/hooks/use-toast';
  import type { LeaveRecord, LeaveType } from '@/types/leave';
  import { LEAVE_TYPE_CONFIG, LEAVE_STATUS_LABELS } from '@/types/leave';
  import { NotificationEvents } from '@/lib/notifications';
  import { format as formatDate } from 'date-fns';
 
 interface LeaveApprovalDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   leaveRecord: LeaveRecord | null;
   onSuccess: () => void;
 }
 
 export function LeaveApprovalDialog({
   open,
   onOpenChange,
   leaveRecord,
   onSuccess,
 }: LeaveApprovalDialogProps) {
   const { user } = useAuth();
   const [leaveType, setLeaveType] = useState<LeaveType>('unpaid');
   const [deductionDays, setDeductionDays] = useState(1);
   const [rejectionReason, setRejectionReason] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);
 
   useEffect(() => {
     if (leaveRecord) {
       setLeaveType(leaveRecord.leave_type);
       setDeductionDays(leaveRecord.deduction_days);
       setRejectionReason('');
     }
   }, [leaveRecord]);
 
   // Update deduction days when leave type changes (for non-custom types)
   useEffect(() => {
     if (leaveType !== 'custom') {
       setDeductionDays(LEAVE_TYPE_CONFIG[leaveType].defaultDeduction);
     }
   }, [leaveType]);
 
   const handleApprove = async () => {
     if (!leaveRecord) return;
 
     try {
       setIsSubmitting(true);
 
       const { error } = await supabase
         .from('leave_records')
         .update({
           status: 'approved',
           leave_type: leaveType,
           deduction_days: deductionDays,
           approved_by: user?.id,
           approved_at: new Date().toISOString(),
         })
         .eq('id', leaveRecord.id);
 
        if (error) throw error;

        // Notify staff and owner
        const dateStr = format(new Date(leaveRecord.leave_date), 'dd MMM yyyy');
        if (leaveRecord.staff?.user_id) {
          NotificationEvents.leaveApproved(
            leaveRecord.staff.user_id,
            leaveRecord.staff.full_name || 'Staff',
            dateStr,
            deductionDays
          );
        }

        toast({
          title: 'Leave Approved',
          description: `Leave record for ${dateStr} has been approved.`,
        });

        onSuccess();
       onOpenChange(false);
     } catch (error: any) {
       console.error('Error approving leave:', error);
       toast({
         title: 'Error',
         description: error.message || 'Failed to approve leave.',
         variant: 'destructive',
       });
     } finally {
       setIsSubmitting(false);
     }
   };
 
   const handleReject = async () => {
     if (!leaveRecord) return;
 
     if (!rejectionReason.trim()) {
       toast({
         title: 'Validation Error',
         description: 'Please provide a rejection reason.',
         variant: 'destructive',
       });
       return;
     }
 
     try {
       setIsSubmitting(true);
 
       const { error } = await supabase
         .from('leave_records')
         .update({
           status: 'rejected',
           rejection_reason: rejectionReason,
           approved_by: user?.id,
           approved_at: new Date().toISOString(),
         })
         .eq('id', leaveRecord.id);
 
        if (error) throw error;

        // Notify staff and owner
        if (leaveRecord.staff?.user_id) {
          const dateStr = format(new Date(leaveRecord.leave_date), 'dd MMM yyyy');
          NotificationEvents.leaveRejected(
            leaveRecord.staff.user_id,
            leaveRecord.staff.full_name || 'Staff',
            dateStr,
            rejectionReason
          );
        }

        toast({
          title: 'Leave Rejected',
          description: `Leave request has been rejected.`,
        });

        onSuccess();
       onOpenChange(false);
     } catch (error: any) {
       console.error('Error rejecting leave:', error);
       toast({
         title: 'Error',
         description: error.message || 'Failed to reject leave.',
         variant: 'destructive',
       });
     } finally {
       setIsSubmitting(false);
     }
   };
 
   if (!leaveRecord) return null;
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle>Review Leave Request</DialogTitle>
           <DialogDescription>
             Approve or reject this leave request and set the salary deduction.
           </DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4 py-4">
           {/* Leave Details */}
           <div className="rounded-lg border p-4 space-y-3">
             <div className="flex items-center gap-2">
               <User className="h-4 w-4 text-muted-foreground" />
               <span className="font-medium">{leaveRecord.staff?.full_name}</span>
               <Badge variant="outline" className="ml-auto">
                 {leaveRecord.staff?.employee_id}
               </Badge>
             </div>
             <div className="flex items-center gap-2">
               <Calendar className="h-4 w-4 text-muted-foreground" />
               <span>{format(new Date(leaveRecord.leave_date), 'EEEE, dd MMMM yyyy')}</span>
             </div>
             {leaveRecord.remarks && (
               <div className="text-sm text-muted-foreground pt-2 border-t">
                 <strong>Remarks:</strong> {leaveRecord.remarks}
               </div>
             )}
           </div>
 
           <Separator />
 
           {/* Leave Type */}
           <div className="space-y-2">
             <Label>Leave Type</Label>
             <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
               <SelectTrigger>
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 {Object.entries(LEAVE_TYPE_CONFIG).map(([value, config]) => (
                   <SelectItem key={value} value={value}>
                     {config.label} ({config.defaultDeduction} day deduction)
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           {/* Deduction Days */}
           <div className="space-y-2">
             <Label>Salary Deduction (Days)</Label>
             <Input
               type="number"
               min="0"
               max="10"
               step="0.5"
               value={deductionDays}
               onChange={(e) => setDeductionDays(Number(e.target.value) || 0)}
               disabled={leaveType !== 'custom'}
             />
             {leaveType !== 'custom' && (
               <p className="text-xs text-muted-foreground">
                 Use "Custom" type to set a different deduction.
               </p>
             )}
           </div>
 
           <Separator />
 
           {/* Rejection Reason */}
           <div className="space-y-2">
             <Label>Rejection Reason (if rejecting)</Label>
             <Textarea
               value={rejectionReason}
               onChange={(e) => setRejectionReason(e.target.value)}
               placeholder="Required if rejecting..."
               rows={2}
             />
           </div>
         </div>
 
         <DialogFooter className="flex-col sm:flex-row gap-2">
           <Button 
             variant="destructive" 
             onClick={handleReject} 
             disabled={isSubmitting}
             className="w-full sm:w-auto"
           >
             <XCircle className="mr-2 h-4 w-4" />
             Reject
           </Button>
           <Button 
             onClick={handleApprove} 
             disabled={isSubmitting}
             className="w-full sm:w-auto"
           >
             <CheckCircle className="mr-2 h-4 w-4" />
             Approve ({deductionDays} day deduction)
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }