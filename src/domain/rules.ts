// Workflow rules: PROTOTYPE ASSUMPTIONS pending Divine Freight validation.
// See docs/PROTOTYPE_ASSUMPTIONS.md. The repository, the UI and the tests all use these functions.
import type { FinanceSummary } from "./finance";
import { totalsList } from "./finance";
import type {
  DocType,
  DocumentRequirement,
  Invoice,
  PaymentNotification,
  Shipment,
  ShipmentCategory,
  ShipmentDocument,
  ShipmentException,
  Stage,
  Task,
  UserRole,
} from "./types";
import { STAGES } from "./types";

/* ---------------------------------------------------------------- documents */

export const REQUIRED_DOCS_BY_CATEGORY: Record<ShipmentCategory, { docType: DocType; label: string }[]> = {
  import: [
    { docType: "commercial_invoice", label: "Commercial invoice" },
    { docType: "packing_list", label: "Packing list" },
    { docType: "transport_document", label: "Transport document (bill of lading / road manifest)" },
    { docType: "certificate_of_origin", label: "Certificate of origin" },
    { docType: "client_authority", label: "Client authority to act" },
  ],
  export: [
    { docType: "commercial_invoice", label: "Commercial invoice" },
    { docType: "packing_list", label: "Packing list" },
    { docType: "client_authority", label: "Client authority to act" },
  ],
  transit: [
    { docType: "commercial_invoice", label: "Commercial invoice" },
    { docType: "transport_document", label: "Transport document (bill of lading / road manifest)" },
    { docType: "client_authority", label: "Client authority to act" },
  ],
};

export const UPLOAD_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  types: {
    "application/pdf": [".pdf"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "text/plain": [".txt"],
  } as Record<string, string[]>,
};

export type RequirementState = "missing" | "under_review" | "accepted" | "rejected";

export interface RequirementView {
  requirement: DocumentRequirement;
  latest: ShipmentDocument | null;
  history: ShipmentDocument[]; // newest first, includes latest
  state: RequirementState;
}

function newestFirst(a: ShipmentDocument, b: ShipmentDocument) {
  return b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id);
}

export function requirementViews(reqs: DocumentRequirement[], docs: ShipmentDocument[]): RequirementView[] {
  return reqs.map((requirement) => {
    const history = docs.filter((d) => d.requirementId === requirement.id).sort(newestFirst);
    // An accepted document satisfies the requirement even if a later upload is pending.
    const accepted = history.find((d) => d.status === "accepted");
    const latest = history[0] ?? null;
    let state: RequirementState = "missing";
    if (accepted) state = "accepted";
    else if (latest?.status === "pending_review") state = "under_review";
    else if (latest?.status === "rejected") state = "rejected";
    return { requirement, latest: accepted ?? latest, history, state };
  });
}

export interface Readiness {
  status: "complete" | "incomplete";
  required: number;
  accepted: number;
  missing: number;
  underReview: number;
  rejected: number;
}

export function computeReadiness(reqs: DocumentRequirement[], docs: ShipmentDocument[]): Readiness {
  const views = requirementViews(
    reqs.filter((r) => r.required),
    docs,
  );
  const r: Readiness = {
    status: "complete",
    required: views.length,
    accepted: 0,
    missing: 0,
    underReview: 0,
    rejected: 0,
  };
  for (const v of views) {
    if (v.state === "accepted") r.accepted++;
    else if (v.state === "missing") r.missing++;
    else if (v.state === "under_review") r.underReview++;
    else r.rejected++;
  }
  r.status = r.accepted === r.required ? "complete" : "incomplete";
  return r;
}

export function hasAcceptedEvidence(docs: ShipmentDocument[], docType: "release_evidence" | "proof_of_delivery") {
  return docs.some((d) => d.docType === docType && d.status === "accepted");
}

/* ---------------------------------------------------------------- transitions */

export function stageIndex(s: Stage) {
  return STAGES.indexOf(s);
}

export function nextStage(s: Stage): Stage | null {
  const i = stageIndex(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export interface Blocker {
  code: string;
  message: string;
  overridable: boolean;
}

export interface TransitionContext {
  shipment: Shipment;
  requirements: DocumentRequirement[];
  documents: ShipmentDocument[];
  tasks: Task[];
  exceptions: ShipmentException[];
  notifications: PaymentNotification[];
  invoices: Invoice[];
  finance: FinanceSummary;
}

export interface TransitionRequest {
  to: Stage;
  submissionReference?: string;
  reason?: string;
  override?: boolean;
}

export const OVERRIDE_ROLES: UserRole[] = ["operations_supervisor"];
export const REOPEN_ROLES: UserRole[] = ["operations_supervisor"];
export const TRANSITION_ROLES: UserRole[] = ["officer", "operations_supervisor"];

export function closureBlockers(ctx: TransitionContext): Blocker[] {
  const b: Blocker[] = [];
  const openBlockingTasks = ctx.tasks.filter((t) => t.status === "open" && t.blocking);
  if (openBlockingTasks.length)
    b.push({
      code: "open_blocking_tasks",
      message: `${openBlockingTasks.length} blocking task(s) still open.`,
      overridable: false,
    });
  const openExceptions = ctx.exceptions.filter((e) => e.status === "open");
  if (openExceptions.length)
    b.push({ code: "open_exceptions", message: `${openExceptions.length} exception(s) still open.`, overridable: false });
  const pending = ctx.notifications.filter((n) => n.status === "notified");
  if (pending.length)
    b.push({
      code: "unverified_notifications",
      message: `${pending.length} client payment notification(s) not yet verified or rejected.`,
      overridable: false,
    });
  if (!ctx.invoices.some((i) => i.status === "issued"))
    b.push({ code: "invoice_not_issued", message: "Service invoice has not been issued.", overridable: false });
  for (const row of totalsList(ctx.finance)) {
    if (row.unrecoveredDisbursements > 0)
      b.push({
        code: "unrecovered_disbursements",
        message: `Unrecovered disbursements of ${row.currency} ${(row.unrecoveredDisbursements / 100).toFixed(2)} must be funded by the client.`,
        overridable: false,
      });
    if (row.clientFundsHeld > 0)
      b.push({
        code: "client_funds_held",
        message: `${row.currency} ${(row.clientFundsHeld / 100).toFixed(2)} of client funds still held. Disburse or refund before closing.`,
        overridable: false,
      });
    if (row.invoiceOutstanding > 0)
      b.push({
        code: "invoice_outstanding",
        message: `Service invoice balance of ${row.currency} ${(row.invoiceOutstanding / 100).toFixed(2)} unpaid.`,
        overridable: true,
      });
  }
  return b;
}

/** Returns the blockers preventing the move. An empty list means the move is permitted as requested. */
export function transitionBlockers(ctx: TransitionContext, req: TransitionRequest): Blocker[] {
  const s = ctx.shipment;
  const b: Blocker[] = [];
  const isReopen = s.stage === "closed" && req.to === "delivered";
  if (!isReopen && nextStage(s.stage) !== req.to) {
    return [
      {
        code: "invalid_transition",
        message: `Cannot move from ${s.stage} to ${req.to}. Stages advance one step at a time.`,
        overridable: false,
      },
    ];
  }
  if (isReopen) {
    if (!req.reason?.trim()) b.push({ code: "reason_required", message: "Reopening requires a reason.", overridable: false });
    return b;
  }
  if (req.to !== "closed" && !s.assignedOfficerId)
    b.push({ code: "no_officer", message: "Assign an officer first.", overridable: false });

  switch (req.to) {
    case "ready_for_submission": {
      const r = computeReadiness(ctx.requirements, ctx.documents);
      if (r.status !== "complete")
        b.push({
          code: "documents_incomplete",
          message: `Required documents incomplete: ${r.accepted}/${r.required} accepted (${r.missing} missing, ${r.rejected} rejected, ${r.underReview} under review).`,
          overridable: true,
        });
      break;
    }
    case "submitted": {
      const ref = req.submissionReference?.trim() || s.externalReference?.trim();
      if (!ref)
        b.push({ code: "submission_reference", message: "Record the customs submission reference.", overridable: false });
      break;
    }
    case "released":
      if (!hasAcceptedEvidence(ctx.documents, "release_evidence"))
        b.push({ code: "release_evidence", message: "Attach release evidence before marking released.", overridable: false });
      break;
    case "delivered":
      if (!hasAcceptedEvidence(ctx.documents, "proof_of_delivery"))
        b.push({ code: "proof_of_delivery", message: "Attach proof of delivery before completing delivery.", overridable: false });
      break;
    case "closed":
      b.push(...closureBlockers(ctx));
      break;
  }
  return b;
}

export type TransitionDecision =
  | { allowed: true; overrideUsed: boolean }
  | { allowed: false; blockers: Blocker[]; message: string };

export function decideTransition(ctx: TransitionContext, req: TransitionRequest, role: UserRole): TransitionDecision {
  const isReopen = ctx.shipment.stage === "closed" && req.to === "delivered";
  if (isReopen ? !REOPEN_ROLES.includes(role) : !TRANSITION_ROLES.includes(role)) {
    const message = isReopen ? "Only an operations supervisor can reopen a file." : "Your role cannot move shipment stages.";
    return { allowed: false, blockers: [{ code: "role", message, overridable: false }], message };
  }
  const blockers = transitionBlockers(ctx, req);
  if (blockers.length === 0) return { allowed: true, overrideUsed: false };
  const hard = blockers.filter((x) => !x.overridable);
  if (hard.length === 0 && req.override) {
    if (!OVERRIDE_ROLES.includes(role))
      return {
        allowed: false,
        blockers,
        message: "Only an operations supervisor can override.",
      };
    if (!req.reason?.trim())
      return { allowed: false, blockers, message: "An override requires a reason." };
    return { allowed: true, overrideUsed: true };
  }
  return { allowed: false, blockers, message: blockers.map((x) => x.message).join(" ") };
}

/* ---------------------------------------------------------------- derived status */

export function isOverdue(dueDate: string, today: string) {
  return dueDate < today;
}

/** Local calendar date (YYYY-MM-DD) in the browser's time zone. */
export function todayISO(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDaysISO(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
