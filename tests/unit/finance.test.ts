// Deterministic financial acceptance fixture. Inputs, formulas and expected
// results are explicit; see docs/PROTOTYPE_ASSUMPTIONS.md A6.
import { describe, expect, it } from "vitest";
import { availableClientFunds, computeFinance, fundingRequestStatus, mergeSummaries, type FinanceRecords } from "@/domain/finance";
import { formatBasisPoints } from "@/domain/money";
import type { Disbursement, FundingRequest, Invoice, InvoiceLine, OperationalCost, PaymentNotification, Receipt } from "@/domain/types";

const base = { shipmentId: "S1", clientId: "C1" };
const fr = (id: string, amount: number, extra: Partial<FundingRequest> = {}): FundingRequest => ({
  ...base, id, purpose: id, amount, currency: "USD", dueDate: "2026-11-01", cancelled: false, createdById: "u", createdAt: "2026-10-01T00:00:00Z", ...extra,
});
const note = (id: string, frId: string, amount: number, status: PaymentNotification["status"]): PaymentNotification => ({
  ...base, id, target: { kind: "funding_request", fundingRequestId: frId }, amount, currency: "USD", payerReference: id, paidOn: "2026-10-02",
  status, notifiedById: "c", notifiedAt: "2026-10-02T00:00:00Z", resolvedById: null, resolvedAt: null, rejectionReason: null,
});
const rcpt = (id: string, allocation: Receipt["allocation"], amount: number, extra: Partial<Receipt> = {}): Receipt => ({
  ...base, id, allocation, notificationId: null, amount, currency: "USD", bankReference: id, receivedOn: "2026-10-03",
  verifiedById: "f", verifiedAt: "2026-10-03T00:00:00Z", reversed: false, reversalReason: null, reversedAt: null, ...extra,
});
const dsb = (id: string, amount: number, extra: Partial<Disbursement> = {}): Disbursement => ({
  ...base, id, category: "duty", payee: "x", amount, currency: "USD", paidOn: "2026-10-04", reference: id, prefunded: false,
  prefundReason: null, recordedById: "f", recordedAt: "2026-10-04T00:00:00Z", ...extra,
});
const inv = (id: string, status: Invoice["status"]): Invoice => ({
  ...base, id, number: id, currency: "USD", status, issuedAt: status === "issued" ? "2026-10-05T00:00:00Z" : null, createdAt: "2026-10-05T00:00:00Z",
});
const line = (id: string, invoiceId: string, amount: number): InvoiceLine => ({ id, invoiceId, description: id, amount });
const cost = (id: string, amount: number): OperationalCost => ({ ...base, id, description: id, amount, currency: "USD", incurredOn: "2026-10-06" });

/**
 * FIXTURE (USD, minor units):
 *  Funding requests  FR1 duty 1,000.00 · FR2 VAT 500.00 · FR3 300.00 CANCELLED
 *  Notifications     N1 FR1 1,000.00 verified · N2 FR2 200.00 NOTIFIED (unverified) · N3 FR2 50.00 rejected
 *  Receipts          R1 FR1 1,000.00 · R2 FR2 100.00 · R3 FR2 400.00 REVERSED · R4 invoice INV1 300.00
 *  Disbursements     D1 1,000.00 · D2 250.00 (pre-funded)
 *  Invoices          INV1 issued: 450.00 + 150.00 · INV2 draft 999.00 (excluded)
 *  Operational costs 120.00 + 35.55
 */
const fixture: FinanceRecords = {
  fundingRequests: [fr("FR1", 100000), fr("FR2", 50000), fr("FR3", 30000, { cancelled: true })],
  notifications: [note("N1", "FR1", 100000, "verified"), note("N2", "FR2", 20000, "notified"), note("N3", "FR2", 5000, "rejected")],
  receipts: [
    rcpt("R1", { kind: "client_funds", fundingRequestId: "FR1" }, 100000),
    rcpt("R2", { kind: "client_funds", fundingRequestId: "FR2" }, 10000),
    rcpt("R3", { kind: "client_funds", fundingRequestId: "FR2" }, 40000, { reversed: true, reversalReason: "bounced" }),
    rcpt("R4", { kind: "invoice", invoiceId: "INV1" }, 30000),
  ],
  disbursements: [dsb("D1", 100000), dsb("D2", 25000, { prefunded: true, prefundReason: "approved" })],
  invoices: [inv("INV1", "issued"), inv("INV2", "draft")],
  invoiceLines: [line("L1", "INV1", 45000), line("L2", "INV1", 15000), line("L3", "INV2", 99900)],
  costs: [cost("K1", 12000), cost("K2", 3555)],
};

describe("financial acceptance fixture", () => {
  const usd = computeFinance(fixture).USD!;
  it.each([
    ["fundingRequested", "FR1 + FR2 (cancelled FR3 excluded)", 150000],
    ["notifiedUnverified", "N2 only; never counted as funds", 20000],
    ["verifiedClientFunds", "R1 + R2 (reversed R3 and invoice R4 excluded)", 110000],
    ["disbursed", "D1 + D2", 125000],
    ["clientFundsHeld", "max(0, 1100.00 - 1250.00)", 0],
    ["unrecoveredDisbursements", "max(0, 1250.00 - 1100.00)", 15000],
    ["fundingOutstanding", "FR1: 0 + FR2: 500.00 - 100.00", 40000],
    ["serviceInvoiced", "INV1 lines only (draft excluded)", 60000],
    ["servicePaid", "R4", 30000],
    ["invoiceOutstanding", "600.00 - 300.00", 30000],
    ["operationalCosts", "120.00 + 35.55", 15555],
    ["contribution", "600.00 - 155.55", 44445],
    ["marginBp", "44445 / 60000 = 7407.5 bp -> 7408", 7408],
  ] as const)("%s = %s", (key, _formula, expected) => {
    expect(usd[key]).toBe(expected);
  });

  it("formats illustrative margin", () => expect(formatBasisPoints(usd.marginBp)).toBe("74.1%"));

  it("funding request statuses derive from verified receipts, not notifications", () => {
    expect(fundingRequestStatus(fixture.fundingRequests[0], fixture.receipts, fixture.notifications)).toBe("funded");
    expect(fundingRequestStatus(fixture.fundingRequests[1], fixture.receipts, fixture.notifications)).toBe("partially_funded");
    expect(fundingRequestStatus(fixture.fundingRequests[2], fixture.receipts, fixture.notifications)).toBe("cancelled");
    const onlyNotified = fr("FR9", 1000);
    expect(fundingRequestStatus(onlyNotified, [], [note("N9", "FR9", 1000, "notified")])).toBe("payment_notified");
    expect(fundingRequestStatus(onlyNotified, [], [])).toBe("awaiting_payment");
  });

  it("an unverified notification adds nothing to available funds", () => {
    const withNote = computeFinance({ ...fixture, notifications: [...fixture.notifications, note("N10", "FR2", 999999, "notified")] });
    expect(availableClientFunds(withNote, "USD")).toBe(availableClientFunds(computeFinance(fixture), "USD"));
  });

  it("overpayment becomes client funds held, never revenue", () => {
    const s = computeFinance({
      ...fixture,
      fundingRequests: [fr("A", 10000)],
      receipts: [rcpt("RA", { kind: "client_funds", fundingRequestId: "A" }, 12500)],
      disbursements: [dsb("DA", 10000)],
      invoices: [],
      invoiceLines: [],
      costs: [],
      notifications: [],
    }).USD!;
    expect(s.fundingOutstanding).toBe(0);
    expect(s.clientFundsHeld).toBe(2500);
    expect(s.serviceInvoiced).toBe(0);
    expect(s.contribution).toBe(0);
    expect(s.marginBp).toBeNull();
  });

  it("invoice overpayment is reported separately", () => {
    const s = computeFinance({ ...fixture, receipts: [rcpt("RX", { kind: "invoice", invoiceId: "INV1" }, 70000)] }).USD!;
    expect(s.invoiceOutstanding).toBe(0);
    expect(s.invoiceOverpaid).toBe(10000);
  });

  it("keeps currencies separate and never aggregates them", () => {
    const zarFr = fr("Z1", 200000, { currency: "ZAR" });
    const s = computeFinance({
      ...fixture,
      fundingRequests: [...fixture.fundingRequests, zarFr],
      receipts: [...fixture.receipts, rcpt("RZ", { kind: "client_funds", fundingRequestId: "Z1" }, 200000, { currency: "ZAR" })],
      disbursements: [...fixture.disbursements, dsb("DZ", 50000, { currency: "ZAR" })],
    });
    expect(Object.keys(s).sort()).toEqual(["USD", "ZAR"]);
    expect(s.USD!.verifiedClientFunds).toBe(110000);
    expect(s.USD!.unrecoveredDisbursements).toBe(15000); // ZAR money does not cover the USD shortfall
    expect(s.ZAR!.clientFundsHeld).toBe(150000);
    expect(availableClientFunds(s, "USD")).toBe(0);
    expect(availableClientFunds(s, "ZAR")).toBe(150000);
  });

  it("portfolio totals sum per-file exposure per currency (no netting across files)", () => {
    const a = computeFinance({ ...fixture }); // unrecovered 150.00
    const b = computeFinance({
      ...fixture,
      fundingRequests: [fr("B", 50000)],
      receipts: [rcpt("RB", { kind: "client_funds", fundingRequestId: "B" }, 50000)],
      disbursements: [],
      invoices: [],
      invoiceLines: [],
      costs: [],
      notifications: [],
    }); // held 500.00
    const m = mergeSummaries([a, b]).USD!;
    expect(m.unrecoveredDisbursements).toBe(15000);
    expect(m.clientFundsHeld).toBe(50000);
    expect(m.serviceInvoiced).toBe(60000);
    expect(m.marginBp).toBe(7408);
  });
});
