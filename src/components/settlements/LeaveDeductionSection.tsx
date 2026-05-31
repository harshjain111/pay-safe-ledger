 import { useState, useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Label } from '@/components/ui/label';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { Alert, AlertDescription } from '@/components/ui/alert';
 import { Separator } from '@/components/ui/separator';
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar, ChevronDown, ChevronUp, Info, Gift, CheckCircle } from 'lucide-react';
 import { format } from 'date-fns';
 import { Amount } from '@/components/ui/amount';
 import type { LeaveRecord } from '@/types/leave';
 import { LEAVE_TYPE_CONFIG } from '@/types/leave';
import { cn } from '@/lib/utils';
 
 interface LeaveDeductionSectionProps {
   staffId: string;
   month: string;
   dailySalary: number;
   onDeductionChange: (systemDays: number, finalDays: number, reason?: string) => void;
   disabled?: boolean;
 }
 
 export function LeaveDeductionSection({
   staffId,
   month,
   dailySalary,
   onDeductionChange,
   disabled,
 }: LeaveDeductionSectionProps) {
   const { userRole } = useAuth();
   const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
   const [isLoading, setIsLoading] = useState(false);
   const [isExpanded, setIsExpanded] = useState(false);
   
   // System-calculated values (read-only)
   const [systemDeductionDays, setSystemDeductionDays] = useState(0);
   
   // Owner override values
   const [finalDeductionDays, setFinalDeductionDays] = useState(0);
   const [adjustmentReason, setAdjustmentReason] = useState('');
 
   const isOwner = userRole === 'owner';
   const hasOverride = finalDeductionDays !== systemDeductionDays;
 
   useEffect(() => {
     if (staffId && month) {
       fetchLeaveData();
     }
   }, [staffId, month]);
 
   useEffect(() => {
     onDeductionChange(systemDeductionDays, finalDeductionDays, adjustmentReason);
   }, [systemDeductionDays, finalDeductionDays, adjustmentReason]);
 
   const fetchLeaveData = async () => {
     try {
       setIsLoading(true);
 
       // Get system deduction days from RPC
       const { data: deductionData, error: deductionError } = await supabase
         .rpc('get_system_deduction_days', {
           _staff_id: staffId,
           _month: month,
         });
 
       if (deductionError) throw deductionError;
 
       const systemDays = Number(deductionData) || 0;
       setSystemDeductionDays(systemDays);
       setFinalDeductionDays(systemDays); // Default to system value
 
       // Fetch individual leave records for display
       const { data: recordsData, error: recordsError } = await supabase
         .rpc('get_monthly_leave_records', {
           _staff_id: staffId,
           _month: month,
         });
 
       if (recordsError) throw recordsError;
       
       setLeaveRecords((recordsData as unknown as LeaveRecord[]) || []);
     } catch (error) {
       console.error('Error fetching leave data:', error);
     } finally {
       setIsLoading(false);
     }
   };
 
  const handleFinalDeductionChange = (value: number) => {
    // Owner can freely set deduction days (increase or decrease)
    const clamped = Math.max(0, value);
    setFinalDeductionDays(clamped);
  };
 
   const systemDeductionAmount = systemDeductionDays * dailySalary;
   const finalDeductionAmount = finalDeductionDays * dailySalary;
   const adjustmentAmount = systemDeductionAmount - finalDeductionAmount;
 
   if (isLoading) {
     return (
       <Card>
         <CardContent className="py-6">
           <div className="flex items-center justify-center">
             <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
           </div>
         </CardContent>
       </Card>
     );
   }
 
   return (
    <Card className={cn(hasOverride && "border-success/50")}>
      <CardHeader className="pb-2">
         <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Leave Deduction Summary
          </CardTitle>
          <Badge variant={leaveRecords.length > 0 ? 'default' : 'secondary'} className="text-xs">
             {leaveRecords.length} leave{leaveRecords.length !== 1 ? 's' : ''}
           </Badge>
         </div>
       </CardHeader>
 
       <CardContent className="space-y-4">
        {/* Quick Summary Row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Approved Leaves</p>
            <p className="text-lg font-bold">{leaveRecords.length}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">System Deduction</p>
            <p className="text-lg font-bold">{systemDeductionDays}d</p>
          </div>
          <div className={cn(
            "p-3 rounded-lg",
            hasOverride ? "bg-success/10" : "bg-muted/50"
          )}>
            <p className="text-xs text-muted-foreground mb-1">Final Deduction</p>
            <p className={cn("text-lg font-bold", hasOverride && "text-success")}>
              {finalDeductionDays}d
            </p>
           </div>
         </div>
 
         {/* Leave Records Collapsible */}
         {leaveRecords.length > 0 && (
           <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
             <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between h-8">
                <span className="text-xs">View leave breakdown</span>
                 {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
               </Button>
             </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-2">
               {leaveRecords.map((record) => (
                 <div 
                   key={record.id} 
                  className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30"
                 >
                   <div>
                    <span className="text-sm">
                       {format(new Date(record.leave_date), 'dd MMM yyyy')}
                     </span>
                    <Badge variant="outline" className="ml-2 text-[10px] px-1.5">
                       {LEAVE_TYPE_CONFIG[record.leave_type]?.label || record.leave_type}
                     </Badge>
                   </div>
                  <span className="text-sm font-medium">{record.deduction_days}d</span>
                 </div>
               ))}
             </CollapsibleContent>
           </Collapsible>
         )}
 
         <Separator />
 
        {/* Owner Override Section */}
        {isOwner && (
          <div className="space-y-3 p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                <Label htmlFor="finalDeduction" className="text-sm font-medium">
                  Final Deduction (Owner Override)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="finalDeduction"
                  type="number"
                  min="0"
                  step="0.5"
                  value={finalDeductionDays}
                  onChange={(e) => handleFinalDeductionChange(Number(e.target.value) || 0)}
                  disabled={disabled}
                  className="w-20 h-8 text-center"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
            
            {hasOverride && (
              <div className={cn(
                "flex items-center gap-2 p-2 rounded-md",
                finalDeductionDays < systemDeductionDays 
                  ? "bg-success/10 text-success" 
                  : "bg-warning/10 text-warning"
              )}>
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">
                  {finalDeductionDays < systemDeductionDays 
                    ? <>Saving <Amount value={adjustmentAmount} className="font-medium" /> for staff</>
                    : <>Adding {finalDeductionDays - systemDeductionDays} extra deduction days</>
                  }
                </span>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              System value: {systemDeductionDays} days. You can adjust freely as Owner.
            </p>
            
            {hasOverride && (
              <div className="space-y-1.5">
                <Label htmlFor="adjustmentReason" className="text-xs">Reason (optional)</Label>
                <Textarea
                  id="adjustmentReason"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="e.g., Good performance, absence without leave, medical emergency..."
                  rows={2}
                  disabled={disabled}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        )}
        {!isOwner && systemDeductionDays > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Only the Owner can adjust final deduction amounts.
            </AlertDescription>
          </Alert>
        )}
 
         {leaveRecords.length === 0 && systemDeductionDays === 0 && (
          <Alert className="bg-muted/30">
             <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              No approved leaves found for this month.
             </AlertDescription>
           </Alert>
         )}
       </CardContent>
     </Card>
   );
 }