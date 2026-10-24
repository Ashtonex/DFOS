import type { Currency } from "./types";

/** Largest accepted single amount: 10,000,000.00 in major units. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

export type ParseResult = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Parses a user-entered major-unit amount ("1,234.5") into integer minor units.
 * Never goes through floating point: digits are split and combined as integers.
 */
export function parseMoney(input: string): ParseResult {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Enter an amount." };
  if (raw.startsWith("-")) return { ok: false, error: "Amount must be greater than zero." };
  const valid = /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(raw);
  if (!valid) {
    if (/\.\d{3,}$/.test(raw)) return { ok: false, error: "Use at most two decimal places." };
    return { ok: false, error: "Enter a number such as 1250 or 1,250.00." };
  }
  const [whole, frac = ""] = raw.replace(/,/g, "").split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return { ok: false, error: "Amount is too large." };
  if (minor <= 0) return { ok: false, error: "Amount must be greater than zero." };
  if (minor > MAX_AMOUNT_MINOR) return { ok: false, error: "Amount exceeds the 10,000,000.00 demo limit." };
  return { ok: true, minor };
}

export function isValidMinor(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT_MINOR;
}

export function formatMoney(minor: number, currency: Currency): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100).toLocaleString("en-US");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${currency} ${whole}.${cents}`;
}

/** Minor units -> plain major-unit string for form inputs ("1250.00"). */
export function toMajorInput(minor: number): string {
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/**
 * Integer ratio in basis points, rounded half away from zero.
 * Returns null when the denominator is zero (ratio undefined).
 */
export function ratioBasisPoints(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const scaled = numerator * 10000;
  const q = Math.trunc(scaled / denominator);
  const rem = scaled - q * denominator;
  const sameSign = (scaled >= 0) === (denominator > 0);
  return 2 * Math.abs(rem) >= Math.abs(denominator) ? q + (sameSign ? 1 : -1) : q;
}

export function formatBasisPoints(bp: number | null): string {
  if (bp === null) return "n/a";
  const sign = bp < 0 ? "-" : "";
  const abs = Math.abs(bp);
  // one decimal place of percent = 10 bp, round half away from zero
  const tenths = Math.trunc((abs + 5) / 10);
  return `${sign}${Math.trunc(tenths / 10)}.${tenths % 10}%`;
}
