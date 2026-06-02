import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { AmountInput } from '@/components/ui/amount';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Upload, ArrowLeft, Send, Save, Loader2 } from 'lucide-react';
import { format, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { ExpenseCategory, StaffPublic } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS } from '@/types/database';


interface CustomCategory {
  id: string;
  name: string;
  is_active: boolean;
}

interface Club {
  id: string;
  name: string;
  is_active: boolean;
}

const ALLOWED_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

const expenseFormSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .positive('Amount must be greater than 0')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
      message: 'Use at most 2 decimal places',
    }),
  // Built-in ExpenseCategory values, or a `custom:<id>` value that maps to "other" on save.
  category: z
    .string()
    .refine(
      (val) => ALLOWED_CATEGORIES.includes(val as ExpenseCategory) || val.startsWith('custom:'),
      { message: 'Select a valid category' },
    ),
  description: z.string().trim().min(3, 'Description must be at least 3 characters'),
  expense_date: z
    .date({ invalid_type_error: 'Pick a valid date', required_error: 'Pick a date' })
    .refine((d) => d.getTime() <= endOfDay(new Date()).getTime(), {
      message: 'Date cannot be in the future',
    }),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export default function NewExpense() {
  const navigate = useNavigate();
  const { user, staffData, isAccountant, accountingMode, isStaff, isAdmin, isOwner } = useAuth();

  // Staff selector for Admin/Accountant
  const [staffList, setStaffList] = useState<StaffPublic[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [isFetchingStaff, setIsFetchingStaff] = useState(true);

  // Non-schema fields (file uploads + optional associations)
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: 0,
      category: 'other',
      description: '',
      expense_date: new Date(),
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  // Staff creating for themselves
  // Accountant in personal mode also creates for themselves
  const isPersonalRequest = isStaff || (isAccountant && !accountingMode);

  // Admin, Owner, Accountant (in accounting mode) can create for any staff
  const canRequestForOthers = isOwner || isAdmin || (isAccountant && accountingMode);

  useEffect(() => {
    if (isPersonalRequest && staffData?.id) {
      setSelectedStaff(staffData.id);
      setIsFetchingStaff(false);
    } else if (canRequestForOthers) {
      fetchStaffList();
    } else {
      setIsFetchingStaff(false);
    }
    fetchCustomCategories();
    fetchClubs();
  }, [isPersonalRequest, staffData?.id, canRequestForOthers]);

  const fetchCustomCategories = async () => {
    const { data } = await supabase
      .from('custom_expense_categories')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('sort_order');
    if (data) setCustomCategories(data);
  };

  const fetchClubs = async () => {
    const { data } = await supabase
      .from('clubs')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name');
    if (data) setClubs(data);
  };

  const fetchStaffList = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_public')
        .select('*')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setStaffList(data as StaffPublic[] || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setIsFetchingStaff(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `"${file.name}" exceeds 5MB limit and was skipped`,
          variant: 'destructive',
        });
        continue;
      }
      newFiles.push(file);
    }

    const total = proofFiles.length + newFiles.length;
    if (total > 5) {
      toast({
        title: 'Too many files',
        description: 'Maximum 5 files allowed per expense',
        variant: 'destructive',
      });
      return;
    }

    setProofFiles(prev => [...prev, ...newFiles]);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setProofFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadProofs = async (): Promise<string | null> => {
    if (proofFiles.length === 0 || !user) return null;

    const paths: string[] = [];
    for (const file of proofFiles) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('expense-proofs')
        .upload(fileName, file);

      if (error) {
        console.error('Error uploading proof:', error);
        throw new Error(`Failed to upload ${file.name}`);
      }
      paths.push(data.path);
    }

    return paths.join(',');
  };

  const onSubmit = (asDraft: boolean) => async (values: ExpenseFormValues) => {
    if (!selectedStaff) {
      toast({
        title: 'Error',
        description: 'Please select a staff member',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Upload proofs if present
      let proofUrl: string | null = null;
      if (proofFiles.length > 0) {
        proofUrl = await uploadProofs();
      }

      // Map custom categories back to 'other' enum for DB storage
      const dbCategory: ExpenseCategory = values.category.startsWith('custom:')
        ? 'other'
        : (values.category as ExpenseCategory);

      const { data: newExpense, error } = await supabase
        .from('expenses')
        .insert({
          staff_id: selectedStaff,
          amount: values.amount,
          category: dbCategory,
          description: values.description.trim(),
          expense_date: format(values.expense_date, 'yyyy-MM-dd'),
          proof_url: proofUrl,
          status: asDraft ? 'draft' as const : 'pending' as const,
          submitted_at: asDraft ? null : new Date().toISOString(),
          created_by: user?.id,
          club_id: selectedClubId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Get staff name for notification
      const staffName = isPersonalRequest
        ? staffData?.full_name
        : staffList.find(s => s.id === selectedStaff)?.full_name || 'Staff';

      // Notify Owner and Admin about the new expense. Fan-out happens
      // server-side via notify_users_by_role(), which excludes the submitter by
      // default, so the client no longer needs to read user_roles.
      if (!asDraft && newExpense) {
        await supabase.rpc('notify_users_by_role', {
          _roles: ['owner', 'admin'],
          _title: 'New Expense Submitted',
          _message: `${staffName} has submitted an expense of ₹${values.amount.toLocaleString('en-IN')} for "${values.description.slice(0, 50)}${values.description.length > 50 ? '...' : ''}"`,
          _type: 'info',
          _reference_type: 'expense',
          _reference_id: newExpense.id,
        });
      }

      toast({
        title: asDraft ? 'Expense saved as draft' : 'Expense submitted',
        description: asDraft
          ? 'The expense has been saved. It can be submitted later.'
          : 'The expense has been submitted for approval.',
      });

      navigate('/expenses');
    } catch (error) {
      console.error('Error creating expense:', error);
      toast({
        title: 'Error',
        description: 'Failed to create expense. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Expense"
        description={isPersonalRequest
          ? "Record an expense for reimbursement"
          : "Submit an expense request on behalf of a staff member"
        }
      >
        <Button variant="ghost" size="sm" onClick={() => navigate('/expenses')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </PageHeader>

      <Card className="max-w-2xl">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Expense Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {isPersonalRequest
              ? 'Fill in the details for your expense claim'
              : 'Create an expense request on behalf of a staff member'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
          <Form {...form}>
            {/* Staff Selection - for Admin/Owner/Accountant in accounting mode */}
            {canRequestForOthers && (
              <div className="space-y-2">
                <Label htmlFor="staff" className="text-sm">Staff Member *</Label>
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id || ''}>
                        {s.full_name} ({s.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Personal request indicator */}
            {isPersonalRequest && staffData && (
              <div className="p-3 sm:p-4 bg-secondary rounded-lg">
                <p className="text-xs sm:text-sm text-muted-foreground">Submitting for</p>
                <p className="font-medium text-sm sm:text-base">{staffData.full_name}</p>
              </div>
            )}

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Amount *</FormLabel>
                  <AmountInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="0.00"
                    className="h-12 text-lg"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Category *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {EXPENSE_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                      {/* Show custom categories with unique values */}
                      {customCategories
                        .filter(cc => !Object.values(EXPENSE_CATEGORY_LABELS).some(
                          label => label.toLowerCase() === cc.name.toLowerCase()
                        ))
                        .map((cat) => (
                          <SelectItem key={cat.id} value={`custom:${cat.id}`}>
                            {cat.name}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Club (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="club" className="text-sm">Club (Optional)</Label>
              <Select value={selectedClubId || 'none'} onValueChange={(v) => setSelectedClubId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a club (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No club</SelectItem>
                  {clubs.length > 0 ? (
                    clubs.map((club) => (
                      <SelectItem key={club.id} value={club.id}>
                        {club.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-clubs" disabled>No clubs added yet — add in Settings</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Manage clubs from Settings
              </p>
            </div>

            {/* Expense Date */}
            <FormField
              control={form.control}
              name="expense_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Expense Date *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal h-11',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => date && field.onChange(date)}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />


            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the expense (e.g., Cab fare for client meeting)"
                      rows={3}
                      className="text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Proof Upload */}
            <div className="space-y-2">
              <Label htmlFor="proof" className="text-sm">Upload pictures of receipt or proof of expense</Label>
              <div className="flex flex-col gap-2">
                <Input
                  id="proof"
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={handleFileChange}
                  className="cursor-pointer h-11"
                />
                {proofFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {proofFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                        <span className="text-xs sm:text-sm text-muted-foreground truncate max-w-[200px]">
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeFile(index)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Max 5MB per file, up to 5 files. Images or PDF.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 sm:pt-4">
              {isPersonalRequest && (
                <Button
                  variant="outline"
                  onClick={form.handleSubmit(onSubmit(true))}
                  disabled={isSubmitting}
                  className="flex-1 h-11"
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  <span className="text-sm">Save as Draft</span>
                </Button>
              )}
              <Button
                onClick={form.handleSubmit(onSubmit(false))}
                disabled={isSubmitting}
                className="flex-1 h-11"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    <span className="text-sm">Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" />
                    <span className="text-sm">Submit for Approval</span>
                  </>
                )}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
