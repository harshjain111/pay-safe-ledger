/**
 * App branding constants.
 * The product is "VIBRND HR BUDDY" by Vibrnd.
 * The organization using this deployment is shown separately.
 */
import vibrndLogo from '@/assets/vibrnd-logo.png';
import vibrndLogoWhite from '@/assets/vibrnd-logo-white.png';

export const BRAND = {
  productName: 'VIBRND HR BUDDY',
  shortName: 'VIBRND HR',
  company: 'Vibrnd',
  tagline: 'HR & Payroll Suite',
  logo: vibrndLogo,
  logoWhite: vibrndLogoWhite,
  logoPath: '/vibrnd-logo.png',
} as const;

export const ORGANIZATION = {
  name: 'Konnect 2 Hospitality',
  shortName: 'Konnect 2',
} as const;
