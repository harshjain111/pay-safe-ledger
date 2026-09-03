// ============================================================================
// The organisation form's validation schema.
//
// Split out of lib/organization.ts because that module is imported by
// AppLayout (for orgDisplayName) on every single page, and a top-level zod
// schema there pulled ~130 KB of zod into the entry bundle for the sake of one
// string helper. Only the onboarding dialog and the settings card validate
// this form, and both are lazy.
// ============================================================================

import { z } from 'zod';
import { validateGstin } from './gstin';
import type { OrgProfile } from './organization';

export type { OrgProfile };

// Every field is optional at the field level; the refine enforces "trade name OR
// legal name". Format checks only fire when a value is present (the `^$|` branch).
const opt = (max = 120) => z.string().trim().max(max).optional().or(z.literal(''));

export const organizationFormSchema = z
  .object({
    trade_name: opt(),
    legal_name: opt(),
    email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    website: z.string().trim().url('Enter a valid URL (https://…)').optional().or(z.literal('')),
    phone: opt(20),
    // Format + checksum + state-code cross-check happen in the superRefine below
    // (it needs the sibling `state` value, so it can't live on the field alone).
    gstin: z.string().trim().max(15).optional().or(z.literal('')),
    pan: z
      .string()
      .trim()
      .regex(/^$|^[A-Z]{5}[0-9]{4}[A-Z]$/i, 'Enter a valid PAN (AAAAA9999A)')
      .optional()
      .or(z.literal('')),
    address: opt(300),
    city: opt(80),
    state: opt(80),
    pincode: z.string().trim().regex(/^$|^[0-9]{6}$/, 'Enter a 6-digit pincode').optional().or(z.literal('')),
    epf_number: opt(30),
    esi_number: opt(30),
    brand_code: opt(12),
  })
  .refine((d) => Boolean(d.trade_name?.trim()) || Boolean(d.legal_name?.trim()), {
    message: 'Enter at least the Trade name or the Legal name',
    path: ['trade_name'],
  })
  .superRefine((d, ctx) => {
    const gstErr = validateGstin(d.gstin ?? '', d.state ?? null);
    if (gstErr) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: gstErr, path: ['gstin'] });
    }
  });

export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

