## Goal

Expand the Staff module to capture full HR-style employee profiles, document uploads, and employment history — while keeping all new fields optional. Existing required fields (Full Name, Employee ID, Email, Date of Joining) stay required.

## Scope

### 1. Employee Profile (extend `staff` table — all optional)

Already present: `employee_id`, `full_name`, `department`, `designation`, `date_of_joining`, `phone`, `email`.

Add new optional columns:
- `photo_url` (text) — uploaded to `staff-photos` bucket
- `reporting_manager_id` (uuid → staff.id)
- `location` (text) — branch/city
- `address` (text)
- `date_of_birth` (date)
- `gender` (text)
- `blood_group` (text)
- `emergency_contact_name` (text)
- `emergency_contact_phone` (text)
- `emergency_contact_relation` (text)

### 2. Documents (new table `staff_documents`)

Columns: `id`, `staff_id`, `doc_type` (enum: aadhaar, pan, bank_details, education, employment_contract, experience_certificate, other), `doc_number` (text, optional — for Aadhaar/PAN), `file_url` (text), `file_name` (text), `notes` (text), `uploaded_by`, `created_at`.

Bank details captured as separate optional fields on `staff`:
- `bank_account_name`, `bank_account_number`, `bank_ifsc`, `bank_name`

Storage: new private bucket `staff-documents` (Owner/Admin upload + view; staff can view own).

### 3. Employment History (new table `employment_history`)

Columns: `id`, `staff_id`, `event_type` (enum: promotion, transfer, salary_revision, role_change, other), `event_date`, `from_value` (text), `to_value` (text), `notes`, `created_by`, `created_at`.

Salary revisions continue to also write to existing `salary_history` table (source of truth for payroll); employment_history stores the human-readable record.

### 4. UI changes

- **Staff form** (`StaffForm.tsx` / new tabs): organize into tabs — *Basic*, *Contact & Emergency*, *Bank*, *Documents*, *History*. All new fields optional.
- **StaffDetails.tsx**: new cards — Profile (photo, manager, location, DOB), Emergency Contact, Bank Details (masked for non-Owner), Documents (list + upload + download), Employment History (timeline). Reuses existing Salary Structure card.
- Photo shown in Avatar across staff list, details, and dashboard header.
- Reporting Manager: simple dropdown of active staff.

### 5. Storage buckets

```sql
insert into storage.buckets (id, name, public) values
  ('staff-photos', 'staff-photos', true),
  ('staff-documents', 'staff-documents', false);
```

Policies:
- `staff-photos`: public read; Owner/Admin write.
- `staff-documents`: Owner/Admin all; staff read own (path prefix = staff_id).

### 6. RLS

- `staff_documents`: Owner/Admin manage; staff SELECT own (via `get_user_staff_id`); CA SELECT all.
- `employment_history`: Owner manage; Admin/Accountant/CA SELECT; staff SELECT own.

### 7. Out of scope (this change)

- Verification workflow for documents (KYC)
- Auto-OCR / data extraction
- Manager hierarchy reports / org chart
- Promotion approval workflow (entries are recorded directly by Owner/Admin)

## Files to add / change

- Migration: new columns on `staff`, two new tables, two new buckets + policies
- `src/pages/StaffDetails.tsx` — new sections
- `src/pages/StaffForm.tsx` (or wherever the create/edit form lives) — tabbed form with optional fields
- `src/components/staff/DocumentsCard.tsx` (new)
- `src/components/staff/EmploymentHistoryCard.tsx` (new)
- `src/components/staff/EmergencyContactCard.tsx` (new)
- `src/components/staff/BankDetailsCard.tsx` (new, masked for non-Owner)
- `src/lib/staff-uploads.ts` (new) — photo + document upload helpers

## Validation

- Only `full_name`, `employee_id`, `email`, `date_of_joining` remain required.
- Bank details + Aadhaar/PAN visible only to Owner (masked for Admin/Accountant; hidden for others) — consistent with salary privacy memory.
- File upload size limit: 5MB per document (matching existing expense images policy).

Ready to implement on approval.