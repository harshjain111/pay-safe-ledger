import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a string/number into a finite, 2-decimal money/quantity value.
 * Returns `fallback` for null/undefined/empty/NaN/Infinity so a single bad
 * value can never poison a sum or get written to the ledger as NaN.
 */
export function toAmount(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
