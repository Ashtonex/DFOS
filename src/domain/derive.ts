// Pure derivations from a snapshot of stored records. Dashboards, lists and
// drill-downs all use these functions, so a displayed count and its drill-down
// always apply the same predicate.
import { computeFinance, totalsList, type FinanceSummary, mergeSummaries } from "./finance";
import { computeReadiness, isOverdue, type Readiness } from "./rules";
import type {
  ActivityEvent,
  Client,
  Disbursement,
  DocumentRequirement,
  FundingRequest,
  Invoice,
  InvoiceLine,
  Milestone,
  OperationalCost,
  PaymentNotification,
  Receipt,
  Shipment,
  ShipmentDocument,
  ShipmentException,
  Task,
  User,
} from "./types";

export interface Snapshot {
  clients: Client[];
  users: User[];
  shipments: Shipment[];
  milestones: Milestone[];
  requirements: DocumentRequirement[];
  documents: ShipmentDocument[];
  tasks: Task[];
  exceptions: ShipmentException[];
  fundingRequests: FundingRequest[];
  notifications: PaymentNotification[];
  receipts: Receipt[];
  disbursements: Disbursement[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  costs: OperationalCost[];
  activity: ActivityEvent[];
}

export interface ShipmentRow {
  shipment: Shipment;
  clientName: string;
  clientShortName: string;
  officerName: string | null;
  readiness: Readiness;
  finance: FinanceSummary;
  openExceptions: number;
  openExternalDelays: number;
  openTasks: number;
  overdueTasks: number;
  docsAwaitingReview: number;
  pendingNotifications: number;
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K | null | undefined) {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    if (k == null) continue;
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function financeRecordsFor(snap: Snapshot, shipmentId: string) {
  const invoices = snap.invoices.filter((i) => i.shipmentId === shipmentId);
  const invIds = new Set(invoices.map((i) => i.id));
  return {
    fundingRequests: snap.fundingRequests.filter((x) => x.shipmentId === shipmentId),
    notifications: snap.notifications.filter((x) => x.shipmentId === shipmentId),
    receipts: snap.receipts.filter((x) => x.shipmentId === shipmentId),
    disbursements: snap.disbursements.filter((x) => x.shipmentId === shipmentId),
    invoices,
    invoiceLines: snap.invoiceLines.filter((l) => invIds.has(l.invoiceId)),
    costs: snap.costs.filter((x) => x.shipmentId === shipmentId),
  };
}

export function buildRows(snap: Snapshot, today: string): ShipmentRow[] {
  const clients = new Map(snap.clients.map((c) => [c.id, c]));
  const users = new Map(snap.users.map((u) => [u.id, u]));
  const reqs = groupBy(snap.requirements, (r) => r.shipmentId);
  const docs = groupBy(snap.documents, (r) => r.shipmentId);
  const tasks = groupBy(snap.tasks, (r) => r.shipmentId);
  const excs = groupBy(snap.exceptions, (r) => r.shipmentId);
  return snap.shipments.map((s) => {
    const t = tasks.get(s.id) ?? [];
    const e = excs.get(s.id) ?? [];
    const dd = docs.get(s.id) ?? [];
    const fin = financeRecordsFor(snap, s.id);
    return {
      shipment: s,
      clientName: clients.get(s.clientId)?.name ?? "Unknown client",
      clientShortName: clients.get(s.clientId)?.shortName ?? "Unknown client",
      officerName: s.assignedOfficerId ? (users.get(s.assignedOfficerId)?.name ?? null) : null,
      readiness: computeReadiness(reqs.get(s.id) ?? [], dd),
      finance: computeFinance(fin),
      openExceptions: e.filter((x) => x.status === "open").length,
      openExternalDelays: e.filter((x) => x.status === "open" && x.category === "external_delay").length,
      openTasks: t.filter((x) => x.status === "open").length,
      overdueTasks: t.filter((x) => x.status === "open" && isOverdue(x.dueDate, today)).length,
      docsAwaitingReview: dd.filter((x) => x.status === "pending_review" && x.docType !== "proof_of_payment").length,
      pendingNotifications: fin.notifications.filter((n) => n.status === "notified").length,
    };
  });
}

const anyCurrency = (f: FinanceSummary, pick: (t: ReturnType<typeof totalsList>[number]) => number) =>
  totalsList(f).some((t) => pick(t) > 0);

export const SHIPMENT_KPIS = {
  active: {
    label: "Active shipments",
    description: "Files not yet closed",
    test: (r: ShipmentRow) => r.shipment.stage !== "closed",
  },
  awaiting_documents: {
    label: "Files awaiting documents",
    description: "New or in preparation with required documents not all accepted",
    test: (r: ShipmentRow) =>
      (r.shipment.stage === "new_request" || r.shipment.stage === "preparation") && r.readiness.status === "incomplete",
  },
  docs_to_review: {
    label: "Files with documents to review",
    description: "At least one uploaded document awaiting review",
    test: (r: ShipmentRow) => r.docsAwaitingReview > 0,
  },
  awaiting_funds: {
    label: "Files awaiting client funds",
    description: "Active files with an open funding request not fully covered by verified receipts",
    test: (r: ShipmentRow) =>
      r.shipment.stage !== "closed" && anyCurrency(r.finance, (t) => t.fundingOutstanding),
  },
  payments_to_verify: {
    label: "Payment notifications to verify",
    description: "Client says it has paid; finance has not yet verified the receipt",
    test: (r: ShipmentRow) => r.pendingNotifications > 0,
  },
  external_delays: {
    label: "Open external delays",
    description: "Files with an open external processing delay (manually recorded)",
    test: (r: ShipmentRow) => r.openExternalDelays > 0,
  },
  overdue_followups: {
    label: "Files with overdue follow-ups",
    description: "At least one open task past its due date",
    test: (r: ShipmentRow) => r.overdueTasks > 0,
  },
  unassigned: {
    label: "Unassigned requests",
    description: "Active files with no assigned officer",
    test: (r: ShipmentRow) => r.shipment.stage !== "closed" && !r.shipment.assignedOfficerId,
  },
  unrecovered: {
    label: "Files with unrecovered disbursements",
    description: "Disbursed more than verified client funds",
    test: (r: ShipmentRow) => anyCurrency(r.finance, (t) => t.unrecoveredDisbursements),
  },
  ready_to_close: {
    label: "Delivered, not yet closed",
    description: "Delivered files awaiting financial reconciliation and closure",
    test: (r: ShipmentRow) => r.shipment.stage === "delivered",
  },
  closed: {
    label: "Closed files",
    description: "Files closed after reconciliation",
    test: (r: ShipmentRow) => r.shipment.stage === "closed",
  },
} as const;

export type KpiKey = keyof typeof SHIPMENT_KPIS;
export const isKpiKey = (k: string | null | undefined): k is KpiKey => !!k && k in SHIPMENT_KPIS;

export function kpiRows(rows: ShipmentRow[], kpi: KpiKey) {
  return rows.filter(SHIPMENT_KPIS[kpi].test);
}

export function kpiCounts(rows: ShipmentRow[]) {
  const out = {} as Record<KpiKey, number>;
  for (const k of Object.keys(SHIPMENT_KPIS) as KpiKey[]) out[k] = kpiRows(rows, k).length;
  return out;
}

export function portfolioFinance(rows: ShipmentRow[]): FinanceSummary {
  return mergeSummaries(rows.map((r) => r.finance));
}
