// ============================================================================
// Per-organization feature/module entitlements.
//
// The catalog of features lives here (code); the database (`org_features`) only
// stores OVERRIDES — a feature is enabled for an org unless a row disables it.
// That denylist model means a newly-added module is on for every existing org
// until someone explicitly turns it off (nothing is silently hidden).
// ============================================================================

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
}

export const FEATURES: FeatureDef[] = [
  { key: 'staff',       label: 'Staff & HR',        description: 'Employee records, enrolment, documents' },
  { key: 'attendance',  label: 'Attendance',        description: 'Check-in, biometric, geofence, remote selfie' },
  { key: 'roster',      label: 'Shifts & Roster',   description: 'Duty roster, shifts, week-offs' },
  { key: 'leave',       label: 'Leave & Holidays',  description: 'Leave types, balances, holidays' },
  { key: 'payroll',     label: 'Payroll',           description: 'Salary settlements, groups, arrears, payslips' },
  { key: 'finance',     label: 'Finance',           description: 'Ledger, journals, petty cash, accounts' },
  { key: 'expenses',    label: 'Expenses & Advances', description: 'Expense claims and salary advances' },
  { key: 'approvals',   label: 'Approvals',         description: 'Maker–checker approvals inbox' },
  { key: 'reports',     label: 'Reports',           description: 'Attendance/payroll reports and report builder' },
  { key: 'biometric',   label: 'Biometric Devices', description: 'Hardware punch devices + face recognition' },
];

export const ALL_FEATURE_KEYS = FEATURES.map((f) => f.key);

export type FeatureKey = (typeof FEATURES)[number]['key'];
