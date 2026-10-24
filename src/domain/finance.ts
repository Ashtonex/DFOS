// Financial calculations for one shipment (or any set of records).
// Every total is computed per currency; currencies are never aggregated together.
// Profitability figures are illustrative operational calculations, not statutory accounting.
import { ratioBasisPoints } from "./money";
import type {
  Currency,
  Disbursement,
  FundingRequest,
  Invoice,
  InvoiceLine,
  OperationalCost,
  PaymentNotification,
  Receipt,
} from "./types";

export interface FinanceRecords {
  fundingRequests: FundingRequest[];
  notifications: PaymentNotification[];
  receipts: Receipt[];
  disbursements: Disbursement[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  costs: OperationalCost[];
}

export interface CurrencyTotals {
  currency: Currency;
  /** Sum of non-cancelled funding requests. */
  fundingRequested: number;
  /** Client payment notifications not yet verified or rejected (NOT available funds). */
  notifiedUnverified: number;
  /** Verified, non-reversed receipts allocated to client funds. */
  verifiedClientFunds: number;
  /** All disbursements, including client refunds. */
  disbursed: number;
  /** max(0, verifiedClientFunds - disbursed): client money still held. */
  clientFundsHeld: number;
  /** max(0, disbursed - verifiedClientFunds): paid on the client's behalf but not yet recovered. */
  unrecoveredDisbursements: number;
  /** Sum over open requests of max(0, request amount - verified receipts against that request). */
  fundingOutstanding: number;
  /** Total of issued service invoices (revenue measure). */
  serviceInvoiced: number;
  /** Verified, non-reversed receipts allocated to service invoices. */
  servicePaid: number;
  /** max(0, serviceInvoiced - servicePaid). */
  invoiceOutstanding: number;
  /** max(0, servicePaid - serviceInvoiced). */
  invoiceOverpaid: number;
  operationalCosts: number;
  /** serviceInvoiced - operationalCosts (illustrative operational contribution). */
  contribution: number;
  /** contribution / serviceInvoiced in basis points; null when nothing invoiced. */
  marginBp: number | null;
}

export type FinanceSummary = Partial<Record<Currency, CurrencyTotals>>;

function empty(currency: Currency): CurrencyTotals {
  return {
    currency,
    fundingRequested: 0,
    notifiedUnverified: 0,
    verifiedClientFunds: 0,
    disbursed: 0,
    clientFundsHeld: 0,
    unrecoveredDisbursements: 0,
    fundingOutstanding: 0,
    serviceInvoiced: 0,
    servicePaid: 0,
    invoiceOutstanding: 0,
    invoiceOverpaid: 0,
    operationalCosts: 0,
    contribution: 0,
    marginBp: null,
  };
}

export function verifiedForRequest(requestId: string, receipts: Receipt[]): number {
  return receipts
    .filter((r) => !r.reversed && r.allocation.kind === "client_funds" && r.allocation.fundingRequestId === requestId)
    .reduce((s, r) => s + r.amount, 0);
}

export type FundingRequestStatus = "cancelled" | "awaiting_payment" | "payment_notified" | "partially_funded" | "funded";

export function fundingRequestStatus(
  req: FundingRequest,
  receipts: Receipt[],
  notifications: PaymentNotification[],
): FundingRequestStatus {
  if (req.cancelled) return "cancelled";
  const verified = verifiedForRequest(req.id, receipts);
  if (verified >= req.amount) return "funded";
  if (verified > 0) return "partially_funded";
  const pending = notifications.some(
    (n) => n.status === "notified" && n.target.kind === "funding_request" && n.target.fundingRequestId === req.id,
  );
  return pending ? "payment_notified" : "awaiting_payment";
}

export function computeFinance(rec: FinanceRecords): FinanceSummary {
  const out: FinanceSummary = {};
  const t = (c: Currency) => (out[c] ??= empty(c));

  for (const fr of rec.fundingRequests) {
    if (fr.cancelled) continue;
    const row = t(fr.currency);
    row.fundingRequested += fr.amount;
    row.fundingOutstanding += Math.max(0, fr.amount - verifiedForRequest(fr.id, rec.receipts));
  }
  for (const n of rec.notifications) {
    if (n.status === "notified") t(n.currency).notifiedUnverified += n.amount;
  }
  for (const r of rec.receipts) {
    if (r.reversed) continue;
    if (r.allocation.kind === "client_funds") t(r.currency).verifiedClientFunds += r.amount;
    else t(r.currency).servicePaid += r.amount;
  }
  for (const d of rec.disbursements) t(d.currency).disbursed += d.amount;

  const issued = new Map(rec.invoices.filter((i) => i.status === "issued").map((i) => [i.id, i]));
  for (const line of rec.invoiceLines) {
    const inv = issued.get(line.invoiceId);
    if (inv) t(inv.currency).serviceInvoiced += line.amount;
  }
  for (const c of rec.costs) t(c.currency).operationalCosts += c.amount;

  for (const row of Object.values(out)) {
    row.clientFundsHeld = Math.max(0, row.verifiedClientFunds - row.disbursed);
    row.unrecoveredDisbursements = Math.max(0, row.disbursed - row.verifiedClientFunds);
    row.invoiceOutstanding = Math.max(0, row.serviceInvoiced - row.servicePaid);
    row.invoiceOverpaid = Math.max(0, row.servicePaid - row.serviceInvoiced);
    row.contribution = row.serviceInvoiced - row.operationalCosts;
    row.marginBp = ratioBasisPoints(row.contribution, row.serviceInvoiced);
  }
  return out;
}

/** Client funds available for a new disbursement in one currency. */
export function availableClientFunds(summary: FinanceSummary, currency: Currency): number {
  return summary[currency]?.clientFundsHeld ?? 0;
}

export function totalsList(summary: FinanceSummary): CurrencyTotals[] {
  return Object.values(summary).sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Adds per-currency totals together without ever mixing currencies. */
export function mergeSummaries(summaries: FinanceSummary[]): FinanceSummary {
  const out: FinanceSummary = {};
  const additive: (keyof CurrencyTotals)[] = [
    "fundingRequested",
    "notifiedUnverified",
    "verifiedClientFunds",
    "disbursed",
    "clientFundsHeld",
    "unrecoveredDisbursements",
    "fundingOutstanding",
    "serviceInvoiced",
    "servicePaid",
    "invoiceOutstanding",
    "invoiceOverpaid",
    "operationalCosts",
    "contribution",
  ];
  for (const s of summaries) {
    for (const row of Object.values(s)) {
      const acc = (out[row.currency] ??= empty(row.currency));
      for (const k of additive) (acc[k] as number) += row[k] as number;
    }
  }
  for (const row of Object.values(out)) row.marginBp = ratioBasisPoints(row.contribution, row.serviceInvoiced);
  return out;
}
