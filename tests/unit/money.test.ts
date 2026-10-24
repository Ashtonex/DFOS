import { describe, expect, it } from "vitest";
import { formatBasisPoints, formatMoney, parseMoney, ratioBasisPoints } from "@/domain/money";

describe("parseMoney (major-unit input -> integer minor units)", () => {
  it.each([
    ["1250", 125000],
    ["1,250.5", 125050],
    ["1,234,567.89", 123456789],
    ["0.01", 1],
    ["  42.10 ", 4210],
    ["10000000.00", 1000000000],
  ])("parses %s", (input, minor) => {
    expect(parseMoney(input)).toEqual({ ok: true, minor });
  });

  it.each([
    ["", "Enter an amount."],
    ["0", "Amount must be greater than zero."],
    ["0.00", "Amount must be greater than zero."],
    ["-5", "Amount must be greater than zero."],
    ["12.345", "Use at most two decimal places."],
    ["abc", "Enter a number such as 1250 or 1,250.00."],
    ["1,23", "Enter a number such as 1250 or 1,250.00."],
    ["1e5", "Enter a number such as 1250 or 1,250.00."],
    ["10000000.01", "Amount exceeds the 10,000,000.00 demo limit."],
  ])("rejects %j", (input, error) => {
    expect(parseMoney(input)).toEqual({ ok: false, error });
  });

  it("never uses floating point (0.1 + 0.2 style inputs are exact)", () => {
    const a = parseMoney("0.10");
    const b = parseMoney("0.20");
    expect(a.ok && b.ok && a.minor + b.minor).toBe(30);
  });
});

describe("formatting", () => {
  it("formats minor units with explicit currency", () => {
    expect(formatMoney(123456789, "USD")).toBe("USD 1,234,567.89");
    expect(formatMoney(5, "ZAR")).toBe("ZAR 0.05");
    expect(formatMoney(-15000, "USD")).toBe("-USD 150.00");
  });
});

describe("ratioBasisPoints rounding (half away from zero)", () => {
  it.each([
    [1, 8, 1250],
    [1, 3, 3333],
    [2, 3, 6667],
    [-1, 3, -3333],
    [-2, 3, -6667],
    [1, 20000, 1], // exactly 0.5 bp -> 1
    [-1, 20000, -1], // exactly -0.5 bp -> -1
    [44445, 60000, 7408], // 7407.5 -> 7408
    [0, 100, 0],
  ])("%i / %i = %i bp", (n, d, bp) => {
    expect(ratioBasisPoints(n, d)).toBe(bp);
  });
  it("is undefined (null) for a zero denominator", () => {
    expect(ratioBasisPoints(5, 0)).toBeNull();
  });
  it("formats to one decimal percent, half away from zero", () => {
    expect(formatBasisPoints(7408)).toBe("74.1%");
    expect(formatBasisPoints(7405)).toBe("74.1%");
    expect(formatBasisPoints(7404)).toBe("74.0%");
    expect(formatBasisPoints(-2551)).toBe("-25.5%");
    expect(formatBasisPoints(null)).toBe("n/a");
  });
});
