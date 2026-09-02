// PHASE 5 — Indian-numbering amount-in-words for the payslip.
// UPPERCASE, no "rupees" (the caller appends " ONLY"), rounded to the rupee.

const ONES = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

/** 0–99 in words. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

/** 0–999 in words. */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigits(rest);
  return rest ? `${ONES[h]} HUNDRED ${twoDigits(rest)}` : `${ONES[h]} HUNDRED`;
}

/**
 * Indian numbering (thousand, lakh, crore), UPPERCASE, rounded to the nearest
 * rupee. numberToWordsIndian(12479) === "TWELVE THOUSAND FOUR HUNDRED SEVENTY NINE".
 */
export function numberToWordsIndian(n: number): string {
  let v = Math.round(Math.abs(Number(n) || 0));
  if (v === 0) return 'ZERO';

  const parts: string[] = [];
  const crore = Math.floor(v / 10000000);
  v %= 10000000;
  const lakh = Math.floor(v / 100000);
  v %= 100000;
  const thousand = Math.floor(v / 1000);
  v %= 1000;

  if (crore) parts.push(`${numberToWordsIndian(crore)} CRORE`);
  if (lakh) parts.push(`${twoDigits(lakh)} LAKH`);
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`);
  if (v) parts.push(threeDigits(v));

  return parts.join(' ');
}
