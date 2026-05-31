 import { useState } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Calendar } from '@/components/ui/calendar';
 import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from '@/components/ui/dialog';
 import { CalendarIcon, Loader2, Plus } from 'lucide-react';
 import { format } from 'date-fns';
 import { cn } from '@/lib/utils';
 import { toast } from '@/hooks/use-toast';
 
 interface CreateEventDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onSuccess?: () => void;
 }
 
 /**
  * CreateEventDialog - Dialog for creating events/parties
  * 
  * Only Owner, Admin, Accountant can create events.
  * Staff cannot access this dialog.
  * 
  * Event identity = date + location
  */
export function CreateEventDialog({ open, onOpenChange, onSuccess }: CreateEventDialogProps) {
  const { user, isOwner, isAdmin, isAccountant } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form fields
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [location, setLocation] = useState('');
  const [clientName, setClientName] = useState('');

  // Permission check - Owner, Admin, and Accountant can all create events
  const canCreateEvent = isOwner || isAdmin || isAccountant;
 
   const handleSubmit = async () => {
     if (!canCreateEvent || !user) return;
 
     if (!location.trim()) {
       toast({
         title: 'Location required',
         description: 'Please enter the event location',
         variant: 'destructive',
       });
       return;
     }
 
     try {
       setIsSubmitting(true);
 
       const { error } = await supabase
         .from('events')
         .insert({
           event_date: format(eventDate, 'yyyy-MM-dd'),
           location: location.trim(),
           client_name: clientName.trim() || null,
           created_by: user.id,
         });
 
       if (error) throw error;
 
       toast({
         title: 'Event created',
         description: `Event at ${location.trim()} on ${format(eventDate, 'dd MMM yyyy')} has been created.`,
       });
 
       // Reset form
       setEventDate(new Date());
       setLocation('');
       setClientName('');
       
       onOpenChange(false);
       onSuccess?.();
     } catch (error: any) {
       console.error('Error creating event:', error);
       toast({
         title: 'Error',
         description: error.message || 'Failed to create event. Please try again.',
         variant: 'destructive',
       });
     } finally {
       setIsSubmitting(false);
     }
   };
 
   if (!canCreateEvent) return null;
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-[90vw] sm:max-w-md">
         <DialogHeader>
           <DialogTitle className="text-base sm:text-lg">Create Event</DialogTitle>
           <DialogDescription className="text-xs sm:text-sm">
             Create an event or party that expenses can be linked to
           </DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4">
           {/* Event Date */}
           <div className="space-y-2">
             <Label className="text-sm">Event Date *</Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button
                   variant="outline"
                   className={cn(
                     'w-full justify-start text-left font-normal h-10',
                     !eventDate && 'text-muted-foreground'
                   )}
                 >
                   <CalendarIcon className="mr-2 h-4 w-4" />
                   {eventDate ? format(eventDate, 'PPP') : 'Pick a date'}
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0" align="start">
                 <Calendar
                   mode="single"
                   selected={eventDate}
                   onSelect={(date) => date && setEventDate(date)}
                   initialFocus
                   className="p-3 pointer-events-auto"
                 />
               </PopoverContent>
             </Popover>
           </div>
 
           {/* Location */}
           <div className="space-y-2">
             <Label htmlFor="location" className="text-sm">Location *</Label>
             <Input
               id="location"
               value={location}
               onChange={(e) => setLocation(e.target.value)}
               placeholder="e.g., Grand Hyatt, Mumbai"
               className="h-10"
             />
           </div>
 
           {/* Client Name (optional) */}
           <div className="space-y-2">
             <Label htmlFor="clientName" className="text-sm">Client Name (Optional)</Label>
             <Input
               id="clientName"
               value={clientName}
               onChange={(e) => setClientName(e.target.value)}
               placeholder="e.g., ABC Corporation"
               className="h-10"
             />
           </div>
         </div>
 
         <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
           <Button 
             variant="outline" 
             onClick={() => onOpenChange(false)} 
             disabled={isSubmitting}
             className="w-full sm:w-auto"
           >
             Cancel
           </Button>
           <Button 
             onClick={handleSubmit} 
             disabled={isSubmitting || !location.trim()}
             className="w-full sm:w-auto"
           >
             {isSubmitting ? (
               <>
                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                 Creating...
               </>
             ) : (
               <>
                 <Plus className="mr-2 h-4 w-4" />
                 Create Event
               </>
             )}
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }