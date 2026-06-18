// Single source of truth for which `staff` columns are confidential.
//
// Salary, salary structure, statutory enrolment and bank details are visible
// ONLY to the Owner. The app already hides these in the UI for other roles, but
// a masked field is not real protection if the value is still shipped to the
// browser in the API response. So non-owner screens must SELECT only the
// non-sensitive columns below — never `*` — so compensation data never leaves
// the database for accountant/admin/staff sessions.
//
// (The owner remains the only role that fetches the sensitive columns.)

/** Columns on `staff` that must never be sent to a non-owner session. */
export const STAFF_OWNER_ONLY_COLUMNS = [
  'monthly_salary',
  'basic_salary',
  'hra',
  'other_allowances',
  'pf_enrolled',
  'pf_employee_rate_override',
  'esi_enrolled',
  'esi_employee_rate',
  'pt_exempt',
  'bank_account_name',
  'bank_account_number',
  'bank_ifsc',
  'bank_name',
] as const;

/** Every non-sensitive `staff` column — safe to load for any authenticated role. */
export const STAFF_SAFE_COLUMNS = [
  'id',
  'user_id',
  'employee_id',
  'full_name',
  'email',
  'phone',
  'department',
  'department_id',
  'outlet_id',
  'designation',
  'date_of_joining',
  'date_of_leaving',
  'is_active',
  'status',
  'separation_reason',
  'attendance_tracked',
  'weekly_off_day',
  'reporting_manager_id',
  'photo_url',
  'location',
  'address',
  'date_of_birth',
  'gender',
  'blood_group',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relation',
  'created_at',
  'created_by',
  'updated_at',
] as const;

/**
 * Column list for a Supabase `.select()` on `staff`.
 * Owners get every column (`*`, including salary); everyone else gets only the
 * non-salary columns, so confidential compensation data is never transmitted.
 */
export const staffSelect = (isOwner: boolean): string =>
  isOwner ? '*' : STAFF_SAFE_COLUMNS.join(', ');
