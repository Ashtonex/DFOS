// DFOS repository: the ONLY boundary between UI and storage.
// Reads are scoped by Viewer. Mutations validate input, enforce workflow
// rules and write business records + audit events in ONE IndexedDB
// transaction (all-or-nothing). Critical writes accept an idempotency key (opId).
import type { IDBPTransaction } from "idb";
import { z } from "zod";
import { ALL_STORES, ENTITY_STORES, ready, resetDatabase, seedInfo, type StoreName } from "./db";
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { buildRows, financeRecordsFor, type ShipmentRow, type Snapshot } from "@/domain/derive";
import { availableClientFunds, computeFinance, fundingRequestStatus, type FundingRequestStatus } from "@/domain/finance";
import { checkUpload } from "@/domain/files";
import { DOC_TYPE_LABEL, STAGE_CLIENT_LABEL, STAGE_LABEL, EXCEPTION_CATEGORY_LABEL } from "@/domain/labels";
import { isValidMinor, formatMoney } from "@/domain/money";
import {
  POP_TYPES,
  REQUIRED_DOCS_BY_CATEGORY,
  decideTransition,
  nextLodgementReference,
  nextStage,
  requirementViews,
  todayISO,
  transitionBlockers,
  type Blocker,
  type RequirementView,
  type TransitionContext,
  type TransitionRequest,
} from "@/domain/rules";
import {
  CURRENCIES,
  DISBURSEMENT_CATEGORIES,
  DOC_TYPES,
  EXCEPTION_CATEGORIES,
  SHIPMENT_CATEGORIES,
  STAGES,
  TRANSPORT_MODES,
  type ActivityEvent,
  type Client,
  type Disbursement,
  type DocumentRequirement,
  type FundingRequest,
  type Invoice,
  type InvoiceLine,
  type Milestone,
  type OperationalCost,
  type PaymentNotification,
  type Receipt,
  type Shipment,
  type ShipmentDocument,
  type ShipmentException,
  type Task,
  type User,
  type UserRole,
  type Viewer,
} from "@/domain/types";

type Tx = IDBPTransaction<unknown, StoreName[], "readwrite">;

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const STAFF_WRITE_ROLES: UserRole[] = ["officer", "operations_supervisor", "finance"];
export const FINANCE_ROLES: UserRole[] = ["operations_supervisor", "finance"];
export const ASSIGN_ROLES: UserRole[] = ["operations_supervisor"];

/* =================================================================== reads */

async function loadSnapshot(): Promise<Snapshot> {
  const db = await ready();
  const stores = ENTITY_STORES.filter((s) => s !== "blobs");
  const tx = db.transaction(stores, "readonly");
  const [
    clients, users, shipments, milestones, requirements, documents, tasks, exceptions,
    fundingRequests, notifications, receipts, disbursements, invoices, invoiceLines, costs, activity,
  ] = await Promise.all([
    tx.objectStore("clients").getAll(),
    tx.objectStore("users").getAll(),
    tx.objectStore("shipments").getAll(),
    tx.objectStore("milestones").getAll(),
    tx.objectStore("requirements").getAll(),
    tx.objectStore("documents").getAll(),
    tx.objectStore("tasks").getAll(),
    tx.objectStore("exceptions").getAll(),
    tx.objectStore("fundingRequests").getAll(),
    tx.objectStore("notifications").getAll(),
    tx.objectStore("receipts").getAll(),
    tx.objectStore("disbursements").getAll(),
    tx.objectStore("invoices").getAll(),
    tx.objectStore("invoiceLines").getAll(),
    tx.objectStore("costs").getAll(),
    tx.objectStore("activity").getAll(),
  ]);
  await tx.done;
  return {
    clients, users, shipments, milestones, requirements, documents, tasks, exceptions,
    fundingRequests, notifications, receipts, disbursements, invoices, invoiceLines, costs, activity,
  } as Snapshot;
}

/**
 * Restricts a snapshot to what the viewer may see. For clients this filters by
 * clientId and strips internal-only content (notes, tasks, exceptions, costs,
 * internal activity wording, draft invoices, pre-funding reasons).
 */
export function scopeSnapshot(snap: Snapshot, viewer: Viewer): Snapshot {
  if (viewer.kind === "staff") return snap;
  const cid = viewer.clientId;
  const shipments = snap.shipments
    .filter((s) => s.clientId === cid)
    .map((s) => ({ ...s, internalNotes: "" }));
  const ids = new Set(shipments.map((s) => s.id));
  const own = <T extends { shipmentId: string | null }>(xs: T[]) => xs.filter((x) => x.shipmentId !== null && ids.has(x.shipmentId));
  const invoices = own(snap.invoices).filter((i) => i.status === "issued");
  const invIds = new Set(invoices.map((i) => i.id));
  const staffIds = new Set(snap.users.filter((u) => u.role !== "client").map((u) => u.id));
  return {
    clients: snap.clients.filter((c) => c.id === cid),
    users: snap.users.filter((u) => staffIds.has(u.id) || u.clientId === cid),
    shipments,
    milestones: own(snap.milestones).map((m) => ({ ...m, note: null })),
    requirements: own(snap.requirements),
    documents: own(snap.documents).filter((d) => d.clientVisible),
    tasks: [],
    exceptions: [],
    fundingRequests: own(snap.fundingRequests),
    notifications: own(snap.notifications),
    receipts: own(snap.receipts).map((r) => ({ ...r, reversalReason: r.reversed ? "Reversed by finance" : null })),
    disbursements: own(snap.disbursements).map((d) => ({ ...d, prefunded: false, prefundReason: null })),
    invoices,
    invoiceLines: snap.invoiceLines.filter((l) => invIds.has(l.invoiceId)),
    costs: [],
    activity: own(snap.activity)
      .filter((a) => a.clientSummary !== null)
      .map((a) => ({ ...a, summary: a.clientSummary! })),
  };
}

export async function getScopedSnapshot(viewer: Viewer) {
  return scopeSnapshot(await loadSnapshot(), viewer);
}

export interface WorkspaceData {
  snapshot: Snapshot;
  rows: ShipmentRow[];
  today: string;
}

export async function getWorkspace(viewer: Viewer): Promise<WorkspaceData> {
  const snapshot = await getScopedSnapshot(viewer);
  const today = todayISO();
  return { snapshot, rows: buildRows(snapshot, today), today };
}

export async function getReferenceData(viewer: Viewer): Promise<{ clients: Client[]; users: User[] }> {
  const snap = await getScopedSnapshot(viewer);
  return { clients: snap.clients, users: snap.users };
}

export interface FundingRequestView {
  request: FundingRequest;
  status: FundingRequestStatus;
  verified: number;
}

export interface ShipmentDetail {
  row: ShipmentRow;
  shipment: Shipment;
  client: Client;
  officer: User | null;
  requirements: RequirementView[];
  documents: ShipmentDocument[];
  milestones: Milestone[];
  tasks: Task[];
  exceptions: ShipmentException[];
  fundingRequests: FundingRequestView[];
  notifications: PaymentNotification[];
  receipts: Receipt[];
  disbursements: Disbursement[];
  invoices: { invoice: Invoice; lines: InvoiceLine[]; total: number }[];
  costs: OperationalCost[];
  activity: ActivityEvent[];
  users: User[];
  next: { stage: string; blockers: Blocker[] } | null;
}

function contextFor(snap: Snapshot, shipment: Shipment): TransitionContext {
  const fin = financeRecordsFor(snap, shipment.id);
  return {
    shipment,
    requirements: snap.requirements.filter((r) => r.shipmentId === shipment.id),
    documents: snap.documents.filter((d) => d.shipmentId === shipment.id),
    tasks: snap.tasks.filter((t) => t.shipmentId === shipment.id),
    exceptions: snap.exceptions.filter((e) => e.shipmentId === shipment.id),
    notifications: fin.notifications,
    invoices: fin.invoices,
    finance: computeFinance(fin),
  };
}

export async function getShipmentDetail(viewer: Viewer, shipmentId: string): Promise<ShipmentDetail | null> {
  const snap = await getScopedSnapshot(viewer);
  const shipment = snap.shipments.find((s) => s.id === shipmentId);
  if (!shipment) return null; // includes another client's shipment: indistinguishable from missing
  const today = todayISO();
  const row = buildRows({ ...snap, shipments: [shipment] }, today)[0];
  const fin = financeRecordsFor(snap, shipmentId);
  const byNewest = <T extends { at?: string; uploadedAt?: string; createdAt?: string }>(a: T, b: T) =>
    (b.at ?? b.uploadedAt ?? b.createdAt ?? "").localeCompare(a.at ?? a.uploadedAt ?? a.createdAt ?? "");
  const docs = snap.documents.filter((d) => d.shipmentId === shipmentId).sort(byNewest);
  const nxt = nextStage(shipment.stage);
  const ctx = contextFor(snap, shipment);
  return {
    row,
    shipment,
    client: snap.clients.find((c) => c.id === shipment.clientId)!,
    officer: snap.users.find((u) => u.id === shipment.assignedOfficerId) ?? null,
    requirements: requirementViews(ctx.requirements, docs),
    documents: docs,
    milestones: snap.milestones.filter((m) => m.shipmentId === shipmentId).sort((a, b) => a.at.localeCompare(b.at)),
    tasks: ctx.tasks.sort((a, b) => a.status.localeCompare(b.status) || a.dueDate.localeCompare(b.dueDate)),
    exceptions: ctx.exceptions.sort(byNewest),
    fundingRequests: fin.fundingRequests
      .sort(byNewest)
      .map((request) => ({
        request,
        status: fundingRequestStatus(request, fin.receipts, fin.notifications),
        verified: fin.receipts
          .filter((r) => !r.reversed && r.allocation.kind === "client_funds" && r.allocation.fundingRequestId === request.id)
          .reduce((s, r) => s + r.amount, 0),
      })),
    notifications: fin.notifications.sort((a, b) => b.notifiedAt.localeCompare(a.notifiedAt)),
    receipts: fin.receipts.sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt)),
    disbursements: fin.disbursements.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    invoices: fin.invoices.map((invoice) => {
      const lines = fin.invoiceLines.filter((l) => l.invoiceId === invoice.id);
      return { invoice, lines, total: lines.reduce((s, l) => s + l.amount, 0) };
    }),
    costs: fin.costs,
    activity: snap.activity.filter((a) => a.shipmentId === shipmentId).sort(byNewest),
    users: snap.users,
    next: nxt && viewer.kind === "staff" ? { stage: nxt, blockers: transitionBlockers(ctx, { to: nxt }) } : null,
  };
}

export async function getDocumentFile(viewer: Viewer, documentId: string) {
  const db = await ready();
  const doc = (await db.get("documents", documentId)) as ShipmentDocument | undefined;
  if (!doc) throw new NotFoundError("Document");
  if (viewer.kind === "client" && (doc.clientId !== viewer.clientId || !doc.clientVisible)) throw new NotFoundError("Document");
  const blob = (await db.get("blobs", doc.blobId)) as { data: ArrayBuffer; mimeType: string } | undefined;
  if (!blob) throw new NotFoundError("Document file");
  return { document: doc, data: blob.data, mimeType: blob.mimeType };
}

export interface SearchResult {
  kind: "shipment" | "document";
  id: string;
  shipmentId: string;
  title: string;
  subtitle: string;
}

export async function search(viewer: Viewer, query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const snap = await getScopedSnapshot(viewer);
  const clientName = new Map(snap.clients.map((c) => [c.id, c.name]));
  const out: SearchResult[] = [];
  for (const s of snap.shipments) {
    const hay = [s.reference, s.description, clientName.get(s.clientId), s.lodgementReference, s.externalReference, s.clientReference, s.origin, s.destination]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.includes(q))
      out.push({ kind: "shipment", id: s.id, shipmentId: s.id, title: s.reference, subtitle: `${s.description} · ${clientName.get(s.clientId) ?? ""}` });
  }
  const refOf = new Map(snap.shipments.map((s) => [s.id, s.reference]));
  for (const d of snap.documents) {
    if (d.fileName.toLowerCase().includes(q) || DOC_TYPE_LABEL[d.docType].toLowerCase().includes(q))
      out.push({ kind: "document", id: d.id, shipmentId: d.shipmentId, title: d.fileName, subtitle: `${DOC_TYPE_LABEL[d.docType]} · ${refOf.get(d.shipmentId)}` });
  }
  return out.slice(0, 20);
}

export async function getSeedInfo() {
  return seedInfo();
}

/* =================================================================== mutation plumbing */

async function mutate<T>(opId: string | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await ready();
  const tx = db.transaction(ALL_STORES, "readwrite") as Tx;
  tx.done.catch(() => {}); // failure is reported through the awaited path below
  try {
    if (opId) {
      const prior = (await tx.objectStore("ops").get(opId)) as { result: T } | undefined;
      if (prior) {
        await tx.done;
        return prior.result; // idempotent replay: no new records
      }
    }
    const result = await fn(tx);
    if (opId) await tx.objectStore("ops").put({ id: opId, result, at: nowIso() });
    await tx.done;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* transaction already finished */
    }
    throw e;
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
  throw new ValidationError(fieldErrors);
}

async function actorOf(tx: Tx, actorId: string, allowed?: UserRole[]): Promise<User> {
  const u = (await tx.objectStore("users").get(actorId)) as User | undefined;
  if (!u) throw new ForbiddenError("Unknown persona.");
  if (allowed && !allowed.includes(u.role)) throw new ForbiddenError();
  return u;
}

async function shipmentFor(tx: Tx, actor: User, shipmentId: string): Promise<Shipment> {
  const s = (await tx.objectStore("shipments").get(shipmentId)) as Shipment | undefined;
  if (!s || (actor.role === "client" && s.clientId !== actor.clientId)) throw new NotFoundError("Shipment");
  return s;
}

async function byShipment<T>(tx: Tx, store: StoreName, shipmentId: string): Promise<T[]> {
  return (await tx.objectStore(store).index("shipmentId").getAll(shipmentId)) as T[];
}

async function addActivity(tx: Tx, e: Omit<ActivityEvent, "id" | "at"> & { at?: string }) {
  await tx.objectStore("activity").put({ id: newId("act"), at: e.at ?? nowIso(), ...e });
}

async function touch(tx: Tx, s: Shipment, patch: Partial<Shipment> = {}) {
  const next = { ...s, ...patch, version: s.version + 1, updatedAt: nowIso() };
  await tx.objectStore("shipments").put(next);
  return next;
}

async function txSnapshotFor(tx: Tx, shipment: Shipment): Promise<TransitionContext> {
  const id = shipment.id;
  const [requirements, documents, tasks, exceptions, notifications, invoices, fundingRequests, receipts, disbursements, costs] =
    await Promise.all([
      byShipment<DocumentRequirement>(tx, "requirements", id),
      byShipment<ShipmentDocument>(tx, "documents", id),
      byShipment<Task>(tx, "tasks", id),
      byShipment<ShipmentException>(tx, "exceptions", id),
      byShipment<PaymentNotification>(tx, "notifications", id),
      byShipment<Invoice>(tx, "invoices", id),
      byShipment<FundingRequest>(tx, "fundingRequests", id),
      byShipment<Receipt>(tx, "receipts", id),
      byShipment<Disbursement>(tx, "disbursements", id),
      byShipment<OperationalCost>(tx, "costs", id),
    ]);
  const invIds = new Set(invoices.map((i) => i.id));
  const invoiceLines = ((await tx.objectStore("invoiceLines").getAll()) as InvoiceLine[]).filter((l) => invIds.has(l.invoiceId));
  return {
    shipment,
    requirements,
    documents,
    tasks,
    exceptions,
    notifications,
    invoices,
    finance: computeFinance({ fundingRequests, notifications, receipts, disbursements, invoices, invoiceLines, costs }),
  };
}

function assertOpen(s: Shipment) {
  if (s.stage === "closed") throw new DomainError("closed", "This file is closed. Reopen it before making changes.");
}

/* =================================================================== schemas */

const text = (label: string, max = 200) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long (max ${max}).`);
const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Too long (max ${max}).`)
    .transform((v) => (v === "" ? null : v))
    .nullable();
const isoDate = (label: string) => z.string({ error: `${label} is required.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date.`);
const optDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date.")])
  .transform((v) => (v === "" ? null : v))
  .nullable();
const amount = z.number({ error: "Enter an amount." }).refine(isValidMinor, "Enter an amount greater than zero (max 10,000,000.00).");
const currency = z.enum(CURRENCIES, { error: "Choose a currency." });

export const shipmentEditSchema = z.object({
  description: text("Description"),
  mode: z.enum(TRANSPORT_MODES),
  origin: text("Origin", 80),
  destination: text("Destination", 80),
  borderPost: text("Border / processing location", 80),
  expectedArrival: optDate,
  expectedDelivery: optDate,
  clientReference: optText(60),
  externalReference: optText(60),
  internalNotes: z.string().max(2000, "Notes are too long (max 2000)."),
});
export type ShipmentEditInput = z.input<typeof shipmentEditSchema>;

export const shipmentRequestSchema = z.object({
  description: text("Description"),
  category: z.enum(SHIPMENT_CATEGORIES),
  mode: z.enum(TRANSPORT_MODES),
  origin: text("Origin", 80),
  destination: text("Destination", 80),
  borderPost: text("Border / processing location", 80),
  expectedArrival: optDate,
  clientReference: optText(60),
  guidedDemo: z.boolean().default(false),
});
export type ShipmentRequestInput = z.input<typeof shipmentRequestSchema>;

/* =================================================================== shipment mutations */

export async function updateShipment(actorId: string, shipmentId: string, expectedVersion: number, input: ShipmentEditInput) {
  const data = parse(shipmentEditSchema, input);
  if (data.expectedArrival && data.expectedDelivery && data.expectedDelivery < data.expectedArrival)
    throw new ValidationError({ expectedDelivery: "Expected delivery cannot be before expected arrival." });
  return mutate(undefined, async (tx) => {
    const actor = await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const s = await shipmentFor(tx, actor, shipmentId);
    if (s.version !== expectedVersion) throw new ConflictError();
    assertOpen(s);
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => (s[k] ?? null) !== (data[k] ?? null));
    if (changed.length === 0) return { shipment: s, changed };
    const next = await touch(tx, s, data);
    const visible = changed.filter((k) => k !== "internalNotes");
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "shipment.updated",
      summary: `Details updated: ${changed.join(", ")}`,
      clientSummary: visible.length ? "Shipment details updated" : null,
    });
    return { shipment: next, changed };
  });
}

export async function createShipmentRequest(actorId: string, input: ShipmentRequestInput, opId: string) {
  const data = parse(shipmentRequestSchema, input);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, ["client"]);
    const all = (await tx.objectStore("shipments").getAll()) as Shipment[];
    let reference: string;
    if (data.guidedDemo) {
      reference = "DF-DEMO-2026-001";
      if (all.some((s) => s.reference === reference))
        throw new DomainError("demo_exists", "The guided demo shipment already exists. Open it from the guide, or reset demo data to run the scenario again.");
    } else {
      const max = all.reduce((m, s) => {
        const n = /^DF-2026-(\d{4})$/.exec(s.reference)?.[1];
        return n ? Math.max(m, Number(n)) : m;
      }, 100);
      reference = `DF-2026-${String(max + 1).padStart(4, "0")}`;
    }
    const at = nowIso();
    const s: Shipment = {
      id: newId("shp"),
      reference,
      clientId: actor.clientId!,
      description: data.description,
      category: data.category,
      mode: data.mode,
      origin: data.origin,
      destination: data.destination,
      borderPost: data.borderPost,
      assignedOfficerId: null,
      stage: "new_request",
      externalReference: null,
      expectedArrival: data.expectedArrival,
      expectedDelivery: null,
      clientReference: data.clientReference,
      internalNotes: "",
      isGuidedDemo: data.guidedDemo,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    await tx.objectStore("shipments").put(s);
    for (const r of REQUIRED_DOCS_BY_CATEGORY[s.category])
      await tx.objectStore("requirements").put({ id: newId("req"), shipmentId: s.id, docType: r.docType, label: r.label, required: true, createdAt: at });
    await tx.objectStore("milestones").put({ id: newId("ms"), shipmentId: s.id, stage: "new_request", at, byUserId: actorId, note: null, override: false });
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "shipment.requested",
      summary: `Shipment request ${reference} submitted by client`,
      clientSummary: "Shipment request submitted",
    });
    return { shipmentId: s.id, reference };
  });
}

export async function assignOfficer(actorId: string, shipmentId: string, officerId: string) {
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, ASSIGN_ROLES);
    const officer = (await tx.objectStore("users").get(officerId)) as User | undefined;
    if (!officer || !["officer", "operations_supervisor"].includes(officer.role))
      throw new ValidationError({ officerId: "Choose a clearance officer." });
    const s = (await tx.objectStore("shipments").get(shipmentId)) as Shipment | undefined;
    if (!s) throw new NotFoundError("Shipment");
    assertOpen(s);
    if (s.assignedOfficerId === officerId) return { unchanged: true };
    await touch(tx, s, { assignedOfficerId: officerId });
    await addActivity(tx, {
      shipmentId,
      clientId: s.clientId,
      actorId,
      type: "shipment.assigned",
      summary: `Assigned to ${officer.name}`,
      clientSummary: `A clearance officer (${officer.name}) is handling your file`,
    });
    return { unchanged: false };
  });
}

export async function transitionStage(actorId: string, shipmentId: string, req: TransitionRequest, opId: string) {
  const data = parse(
    z.object({
      to: z.enum(STAGES),
      submissionReference: z.string().trim().max(60).optional(),
      reason: z.string().trim().max(500).optional(),
      override: z.boolean().optional(),
    }),
    req,
  );
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId);
    const s = await shipmentFor(tx, actor, shipmentId);
    const ctx = await txSnapshotFor(tx, s);
    const decision = decideTransition(ctx, data, actor.role);
    if (!decision.allowed) throw new DomainError("transition_blocked", decision.message);
    const isReopen = s.stage === "closed" && data.to === "delivered";
    const patch: Partial<Shipment> = { stage: data.to };
    if (data.to === "submitted") {
      if (!s.lodgementReference) {
        const all = (await tx.objectStore("shipments").getAll()) as Shipment[];
        patch.lodgementReference = nextLodgementReference(all.map((x) => x.lodgementReference));
      }
      if (data.submissionReference) patch.externalReference = data.submissionReference;
    }
    const next = await touch(tx, s, patch);
    const submittedNote =
      `DFOS lodgement reference ${next.lodgementReference}` +
      (next.externalReference ? `; customs reference ${next.externalReference} (manually recorded)` : "; customs reference awaited");
    const note = isReopen
      ? `Reopened: ${data.reason}`
      : decision.overrideUsed
        ? `Override: ${data.reason}`
        : data.to === "submitted"
          ? submittedNote
          : null;
    await tx.objectStore("milestones").put({
      id: newId("ms"),
      shipmentId,
      stage: data.to,
      at: nowIso(),
      byUserId: actorId,
      note,
      override: decision.overrideUsed,
    });
    await addActivity(tx, {
      shipmentId,
      clientId: s.clientId,
      actorId,
      type: isReopen ? "stage.reopened" : "stage.changed",
      summary: isReopen ? `File reopened: ${data.reason}` : `Stage changed to ${STAGE_LABEL[data.to]}${note ? ` — ${note}` : ""}`,
      clientSummary: isReopen ? "File reopened for follow-up" : STAGE_CLIENT_LABEL[data.to],
    });
    if (decision.overrideUsed)
      await addActivity(tx, {
        shipmentId,
        clientId: s.clientId,
        actorId,
        type: "override.used",
        summary: `Supervisor override moving to ${STAGE_LABEL[data.to]}: ${data.reason}`,
        clientSummary: null,
      });
    return { stage: data.to, version: next.version, lodgementReference: next.lodgementReference ?? null };
  });
}

/* =================================================================== documents */

export interface UploadInput {
  shipmentId: string;
  requirementId: string | null;
  docType: (typeof DOC_TYPES)[number];
  fileName: string;
  data: ArrayBuffer;
}

export async function uploadDocument(actorId: string, input: UploadInput, opId: string) {
  const check = checkUpload(input.fileName, input.data);
  if (!check.ok) throw new ValidationError({ file: check.error }, check.error);
  if (!DOC_TYPES.includes(input.docType)) throw new ValidationError({ docType: "Unknown document type." });
  if (input.docType === "proof_of_payment")
    throw new ValidationError({ docType: "Attach proof of payment when notifying the payment." });
  const fileName = input.fileName.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId);
    if (actor.role === "management") throw new ForbiddenError("Management view is read-only.");
    const s = await shipmentFor(tx, actor, input.shipmentId);
    assertOpen(s);
    const isClient = actor.role === "client";
    const isEvidence = input.docType === "release_evidence" || input.docType === "proof_of_delivery";
    let requirement: DocumentRequirement | undefined;
    if (input.requirementId) {
      requirement = (await tx.objectStore("requirements").get(input.requirementId)) as DocumentRequirement | undefined;
      if (!requirement || requirement.shipmentId !== s.id) throw new NotFoundError("Requirement");
      const history = (await byShipment<ShipmentDocument>(tx, "documents", s.id)).filter((d) => d.requirementId === requirement!.id);
      if (history.some((d) => d.status === "accepted"))
        throw new DomainError("already_accepted", `${requirement.label} is already accepted.`);
      if (history.some((d) => d.status === "pending_review"))
        throw new DomainError("pending_exists", `A ${requirement.label.toLowerCase()} is already awaiting review.`);
    } else if (!isEvidence || isClient) {
      throw new ValidationError({ requirementId: "Choose which requirement this document satisfies." });
    }
    if (isEvidence) {
      if (input.docType === "release_evidence" && !["submitted", "released"].includes(s.stage))
        throw new DomainError("evidence_stage", "Release evidence can be attached once the entry is submitted.");
      if (input.docType === "proof_of_delivery" && !["released", "in_delivery", "delivered"].includes(s.stage))
        throw new DomainError("evidence_stage", "Proof of delivery can be attached once goods are released.");
    }
    const at = nowIso();
    const blobId = newId("blob");
    await tx.objectStore("blobs").put({ id: blobId, data: input.data, mimeType: check.mimeType });
    // Staff-attached stage evidence is accepted on upload (the uploader is the reviewer).
    const autoAccept = isEvidence && !isClient;
    const doc: ShipmentDocument = {
      id: newId("doc"),
      shipmentId: s.id,
      clientId: s.clientId,
      requirementId: requirement?.id ?? null,
      docType: requirement?.docType ?? input.docType,
      fileName,
      mimeType: check.mimeType,
      size: input.data.byteLength,
      blobId,
      uploadedById: actorId,
      uploadedAt: at,
      status: autoAccept ? "accepted" : "pending_review",
      reviewedById: autoAccept ? actorId : null,
      reviewedAt: autoAccept ? at : null,
      rejectionReason: null,
      clientVisible: true,
    };
    await tx.objectStore("documents").put(doc);
    await touch(tx, s);
    const label = requirement?.label ?? DOC_TYPE_LABEL[input.docType];
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "document.uploaded",
      summary: `${label} uploaded (${fileName})${autoAccept ? " and accepted" : ""}`,
      clientSummary: isClient ? `You uploaded ${label}` : `${label} added to your file`,
    });
    return { documentId: doc.id };
  });
}

export async function reviewDocument(actorId: string, documentId: string, decision: "accept" | "reject", reason?: string) {
  if (decision === "reject" && !reason?.trim()) throw new ValidationError({ reason: "Give the client a reason for rejecting." });
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const doc = (await tx.objectStore("documents").get(documentId)) as ShipmentDocument | undefined;
    if (!doc) throw new NotFoundError("Document");
    if (doc.status !== "pending_review") throw new DomainError("already_reviewed", "This document has already been reviewed.");
    if (doc.docType === "proof_of_payment")
      throw new DomainError("pop_review", "Proof of payment is reviewed by verifying or rejecting its payment notification.");
    const s = (await tx.objectStore("shipments").get(doc.shipmentId)) as Shipment;
    assertOpen(s);
    const at = nowIso();
    await tx.objectStore("documents").put({
      ...doc,
      status: decision === "accept" ? "accepted" : "rejected",
      reviewedById: actorId,
      reviewedAt: at,
      rejectionReason: decision === "reject" ? reason!.trim() : null,
    });
    await touch(tx, s);
    const label = DOC_TYPE_LABEL[doc.docType];
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: decision === "accept" ? "document.accepted" : "document.rejected",
      summary: decision === "accept" ? `${label} accepted` : `${label} rejected: ${reason}`,
      clientSummary: decision === "accept" ? `${label} accepted` : `${label} needs to be resubmitted: ${reason}`,
    });
    return { status: decision };
  });
}

/* =================================================================== exceptions & tasks */

export const exceptionSchema = z.object({
  shipmentId: z.string(),
  category: z.enum(EXCEPTION_CATEGORIES, { error: "Choose a category." }),
  authority: optText(80),
  description: text("Description", 300),
  ownerId: text("Owner"),
  nextAction: text("Next action", 200),
  followUpDate: isoDate("Follow-up date"),
});
export type ExceptionInput = z.input<typeof exceptionSchema>;

export async function recordException(actorId: string, input: ExceptionInput, opId: string) {
  const data = parse(exceptionSchema, input);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const s = await shipmentFor(tx, actor, data.shipmentId);
    assertOpen(s);
    const owner = (await tx.objectStore("users").get(data.ownerId)) as User | undefined;
    if (!owner || owner.role === "client" || owner.role === "management")
      throw new ValidationError({ ownerId: "Choose an operations owner." });
    const at = nowIso();
    const ex: ShipmentException = {
      id: newId("exc"),
      shipmentId: s.id,
      category: data.category,
      authority: data.authority,
      description: data.description,
      ownerId: data.ownerId,
      nextAction: data.nextAction,
      followUpDate: data.followUpDate,
      status: "open",
      statusSource: "manually_recorded",
      createdAt: at,
      resolvedAt: null,
      resolution: null,
    };
    await tx.objectStore("exceptions").put(ex);
    const task: Task = {
      id: newId("task"),
      shipmentId: s.id,
      title: `Follow up: ${data.nextAction}`,
      assigneeId: data.ownerId,
      dueDate: data.followUpDate,
      status: "open",
      blocking: true,
      exceptionId: ex.id,
      createdAt: at,
      completedAt: null,
    };
    await tx.objectStore("tasks").put(task);
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "exception.recorded",
      summary: `${EXCEPTION_CATEGORY_LABEL[data.category]} recorded${data.authority ? ` (${data.authority})` : ""}: ${data.description}. Owner ${owner.name}, follow up ${data.followUpDate}.`,
      clientSummary:
        data.category === "external_delay"
          ? "External processing delay recorded. Our team is following up."
          : null,
    });
    return { exceptionId: ex.id, taskId: task.id };
  });
}

export async function resolveException(actorId: string, exceptionId: string, resolution: string) {
  if (!resolution.trim()) throw new ValidationError({ resolution: "Describe how the exception was resolved." });
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const ex = (await tx.objectStore("exceptions").get(exceptionId)) as ShipmentException | undefined;
    if (!ex) throw new NotFoundError("Exception");
    if (ex.status === "resolved") throw new DomainError("already_resolved", "This exception is already resolved.");
    const at = nowIso();
    await tx.objectStore("exceptions").put({ ...ex, status: "resolved", resolvedAt: at, resolution: resolution.trim() });
    const tasks = await byShipment<Task>(tx, "tasks", ex.shipmentId);
    for (const t of tasks.filter((t) => t.exceptionId === ex.id && t.status === "open"))
      await tx.objectStore("tasks").put({ ...t, status: "done", completedAt: at });
    const s = (await tx.objectStore("shipments").get(ex.shipmentId)) as Shipment;
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "exception.resolved",
      summary: `Exception resolved: ${resolution.trim()}`,
      clientSummary: ex.category === "external_delay" ? "External processing delay resolved" : null,
    });
    return { ok: true };
  });
}

export const taskSchema = z.object({
  shipmentId: z.string(),
  title: text("Task", 200),
  assigneeId: text("Assignee"),
  dueDate: isoDate("Due date"),
  blocking: z.boolean(),
});
export type TaskInput = z.input<typeof taskSchema>;

export async function createTask(actorId: string, input: TaskInput, opId: string) {
  const data = parse(taskSchema, input);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const s = await shipmentFor(tx, actor, data.shipmentId);
    assertOpen(s);
    const assignee = (await tx.objectStore("users").get(data.assigneeId)) as User | undefined;
    if (!assignee || assignee.role === "client") throw new ValidationError({ assigneeId: "Choose a staff member." });
    const t: Task = { id: newId("task"), ...data, status: "open", exceptionId: null, createdAt: nowIso(), completedAt: null };
    await tx.objectStore("tasks").put(t);
    await addActivity(tx, { shipmentId: s.id, clientId: s.clientId, actorId, type: "task.created", summary: `Task created for ${assignee.name}: ${data.title}`, clientSummary: null });
    return { taskId: t.id };
  });
}

export async function completeTask(actorId: string, taskId: string) {
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const t = (await tx.objectStore("tasks").get(taskId)) as Task | undefined;
    if (!t) throw new NotFoundError("Task");
    if (t.status === "done") throw new DomainError("already_done", "This task is already complete.");
    if (t.exceptionId) {
      const ex = (await tx.objectStore("exceptions").get(t.exceptionId)) as ShipmentException | undefined;
      if (ex?.status === "open")
        throw new DomainError("exception_open", "This follow-up belongs to an open exception. Resolve the exception to close it.");
    }
    await tx.objectStore("tasks").put({ ...t, status: "done", completedAt: nowIso() });
    const s = (await tx.objectStore("shipments").get(t.shipmentId)) as Shipment;
    await addActivity(tx, { shipmentId: s.id, clientId: s.clientId, actorId, type: "task.completed", summary: `Task completed: ${t.title}`, clientSummary: null });
    return { ok: true };
  });
}

/* =================================================================== money */

export const fundingRequestSchema = z.object({
  shipmentId: z.string(),
  purpose: text("Purpose", 120),
  amount,
  currency,
  dueDate: isoDate("Due date"),
});
export type FundingRequestInput = z.input<typeof fundingRequestSchema>;

export async function createFundingRequest(actorId: string, input: FundingRequestInput, opId: string) {
  const data = parse(fundingRequestSchema, input);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, STAFF_WRITE_ROLES);
    const s = await shipmentFor(tx, actor, data.shipmentId);
    assertOpen(s);
    const fr: FundingRequest = { id: newId("fr"), clientId: s.clientId, cancelled: false, createdById: actorId, createdAt: nowIso(), ...data };
    await tx.objectStore("fundingRequests").put(fr);
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "funding.requested",
      summary: `Funding requested: ${data.purpose} ${formatMoney(data.amount, data.currency)}`,
      clientSummary: `Funding requested: ${data.purpose} ${formatMoney(data.amount, data.currency)} due ${data.dueDate}`,
    });
    return { fundingRequestId: fr.id };
  });
}

export async function cancelFundingRequest(actorId: string, fundingRequestId: string, reason: string) {
  if (!reason.trim()) throw new ValidationError({ reason: "Give a reason for cancelling." });
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, FINANCE_ROLES);
    const fr = (await tx.objectStore("fundingRequests").get(fundingRequestId)) as FundingRequest | undefined;
    if (!fr) throw new NotFoundError("Funding request");
    if (fr.cancelled) throw new DomainError("already_cancelled", "Already cancelled.");
    const receipts = await byShipment<Receipt>(tx, "receipts", fr.shipmentId);
    const notes = await byShipment<PaymentNotification>(tx, "notifications", fr.shipmentId);
    const st = fundingRequestStatus(fr, receipts, notes);
    if (st !== "awaiting_payment")
      throw new DomainError("has_payments", "This request has payments notified or received; resolve those first.");
    await tx.objectStore("fundingRequests").put({ ...fr, cancelled: true });
    await addActivity(tx, { shipmentId: fr.shipmentId, clientId: fr.clientId, actorId, type: "funding.cancelled", summary: `Funding request cancelled: ${reason}`, clientSummary: `Funding request "${fr.purpose}" withdrawn` });
    return { ok: true };
  });
}

export const notifySchema = z.object({
  target: z.union([
    z.object({ kind: z.literal("funding_request"), fundingRequestId: z.string() }),
    z.object({ kind: z.literal("invoice"), invoiceId: z.string() }),
  ]),
  amount,
  payerReference: text("Payment reference", 60),
  paidOn: isoDate("Payment date"),
});
export type NotifyInput = z.input<typeof notifySchema>;

export interface ProofOfPayment {
  fileName: string;
  data: ArrayBuffer;
}

/**
 * Client notifies a payment, optionally attaching proof of payment (PDF or screenshot).
 * This is a CLAIM: neither the notification nor its proof becomes available funds until
 * finance verifies the receipt against the bank statement.
 */
export async function notifyPayment(actorId: string, input: NotifyInput, opId: string, pop?: ProofOfPayment) {
  const data = parse(notifySchema, input);
  if (data.paidOn > todayISO()) throw new ValidationError({ paidOn: "Payment date cannot be in the future." });
  let popMime: string | null = null;
  if (pop) {
    const check = checkUpload(pop.fileName, pop.data);
    if (!check.ok) throw new ValidationError({ pop: check.error }, check.error);
    if (!POP_TYPES.includes(check.mimeType))
      throw new ValidationError({ pop: "Proof of payment must be a PDF, PNG or JPEG (e.g. a bank confirmation or screenshot)." });
    popMime = check.mimeType;
  }
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, ["client"]);
    let shipmentId: string;
    let cur: (typeof CURRENCIES)[number];
    if (data.target.kind === "funding_request") {
      const fr = (await tx.objectStore("fundingRequests").get(data.target.fundingRequestId)) as FundingRequest | undefined;
      if (!fr || fr.clientId !== actor.clientId) throw new NotFoundError("Funding request");
      if (fr.cancelled) throw new DomainError("cancelled", "This funding request was withdrawn.");
      shipmentId = fr.shipmentId;
      cur = fr.currency;
    } else {
      const inv = (await tx.objectStore("invoices").get(data.target.invoiceId)) as Invoice | undefined;
      if (!inv || inv.clientId !== actor.clientId || inv.status !== "issued") throw new NotFoundError("Invoice");
      shipmentId = inv.shipmentId;
      cur = inv.currency;
    }
    const s = await shipmentFor(tx, actor, shipmentId);
    let popDocumentId: string | null = null;
    if (pop && popMime) {
      const blobId = newId("blob");
      await tx.objectStore("blobs").put({ id: blobId, data: pop.data, mimeType: popMime });
      popDocumentId = newId("doc");
      const doc: ShipmentDocument = {
        id: popDocumentId,
        shipmentId,
        clientId: s.clientId,
        requirementId: null,
        docType: "proof_of_payment",
        fileName: pop.fileName.replace(/[^\w.\- ()]/g, "_").slice(0, 120),
        mimeType: popMime,
        size: pop.data.byteLength,
        blobId,
        uploadedById: actorId,
        uploadedAt: nowIso(),
        status: "pending_review",
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
        clientVisible: true,
      };
      await tx.objectStore("documents").put(doc);
    }
    const n: PaymentNotification = {
      id: newId("pn"),
      shipmentId,
      clientId: s.clientId,
      target: data.target,
      amount: data.amount,
      currency: cur,
      payerReference: data.payerReference,
      paidOn: data.paidOn,
      status: "notified",
      notifiedById: actorId,
      notifiedAt: nowIso(),
      resolvedById: null,
      resolvedAt: null,
      rejectionReason: null,
      popDocumentId,
    };
    await tx.objectStore("notifications").put(n);
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId,
      clientId: s.clientId,
      actorId,
      type: "payment.notified",
      summary: `Client notified payment of ${formatMoney(n.amount, cur)} (ref ${n.payerReference})${popDocumentId ? " with proof of payment" : ""} — awaiting verification`,
      clientSummary: `You notified a payment of ${formatMoney(n.amount, cur)}${popDocumentId ? " with proof of payment" : ""}. Awaiting verification by Divine Freight finance.`,
    });
    return { notificationId: n.id };
  });
}

/** The proof of payment shares its notification's outcome (kept for audit either way). */
async function resolvePop(tx: Tx, n: PaymentNotification, actorId: string, status: "accepted" | "rejected", reason: string | null) {
  if (!n.popDocumentId) return;
  const doc = (await tx.objectStore("documents").get(n.popDocumentId)) as ShipmentDocument | undefined;
  if (!doc) return;
  await tx.objectStore("documents").put({ ...doc, status, reviewedById: actorId, reviewedAt: nowIso(), rejectionReason: reason });
}

export const verifySchema = z.object({
  amountReceived: amount,
  bankReference: text("Bank reference", 60),
  receivedOn: isoDate("Date received"),
});
export type VerifyInput = z.input<typeof verifySchema>;

/** Finance confirms money actually arrived, creating a verified receipt. */
export async function verifyPayment(actorId: string, notificationId: string, input: VerifyInput, opId: string) {
  const data = parse(verifySchema, input);
  if (data.receivedOn > todayISO()) throw new ValidationError({ receivedOn: "Date received cannot be in the future." });
  return mutate(opId, async (tx) => {
    await actorOf(tx, actorId, FINANCE_ROLES);
    const n = (await tx.objectStore("notifications").get(notificationId)) as PaymentNotification | undefined;
    if (!n) throw new NotFoundError("Payment notification");
    if (n.status !== "notified")
      throw new DomainError("already_resolved", `This notification was already ${n.status}. A receipt cannot be verified twice.`);
    const all = (await tx.objectStore("receipts").getAll()) as Receipt[];
    if (all.some((r) => !r.reversed && r.bankReference.toLowerCase() === data.bankReference.toLowerCase()))
      throw new ValidationError({ bankReference: "This bank reference is already recorded against another receipt." });
    const at = nowIso();
    const r: Receipt = {
      id: newId("rcpt"),
      shipmentId: n.shipmentId,
      clientId: n.clientId,
      allocation:
        n.target.kind === "funding_request"
          ? { kind: "client_funds", fundingRequestId: n.target.fundingRequestId }
          : { kind: "invoice", invoiceId: n.target.invoiceId },
      notificationId: n.id,
      amount: data.amountReceived,
      currency: n.currency,
      bankReference: data.bankReference,
      receivedOn: data.receivedOn,
      verifiedById: actorId,
      verifiedAt: at,
      reversed: false,
      reversalReason: null,
      reversedAt: null,
    };
    await tx.objectStore("receipts").put(r);
    await tx.objectStore("notifications").put({ ...n, status: "verified", resolvedById: actorId, resolvedAt: at });
    await resolvePop(tx, n, actorId, "accepted", null);
    const s = (await tx.objectStore("shipments").get(n.shipmentId)) as Shipment;
    await touch(tx, s);
    const diff = data.amountReceived !== n.amount ? ` (client notified ${formatMoney(n.amount, n.currency)})` : "";
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "receipt.verified",
      summary: `Receipt verified: ${formatMoney(r.amount, r.currency)} bank ref ${r.bankReference}${diff}`,
      clientSummary: `Payment of ${formatMoney(r.amount, r.currency)} received and confirmed`,
    });
    return { receiptId: r.id };
  });
}

export async function rejectNotification(actorId: string, notificationId: string, reason: string) {
  if (!reason.trim()) throw new ValidationError({ reason: "Tell the client why the payment could not be matched." });
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, FINANCE_ROLES);
    const n = (await tx.objectStore("notifications").get(notificationId)) as PaymentNotification | undefined;
    if (!n) throw new NotFoundError("Payment notification");
    if (n.status !== "notified") throw new DomainError("already_resolved", `This notification was already ${n.status}.`);
    await tx.objectStore("notifications").put({ ...n, status: "rejected", resolvedById: actorId, resolvedAt: nowIso(), rejectionReason: reason.trim() });
    await resolvePop(tx, n, actorId, "rejected", reason.trim());
    await addActivity(tx, {
      shipmentId: n.shipmentId,
      clientId: n.clientId,
      actorId,
      type: "payment.unmatched",
      summary: `Payment notification not matched: ${reason}`,
      clientSummary: `We could not match your payment notification of ${formatMoney(n.amount, n.currency)}: ${reason}`,
    });
    return { ok: true };
  });
}

export async function reverseReceipt(actorId: string, receiptId: string, reason: string) {
  if (!reason.trim()) throw new ValidationError({ reason: "A reversal requires a reason." });
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, ["operations_supervisor"]);
    const r = (await tx.objectStore("receipts").get(receiptId)) as Receipt | undefined;
    if (!r) throw new NotFoundError("Receipt");
    if (r.reversed) throw new DomainError("already_reversed", "This receipt is already reversed.");
    const s = (await tx.objectStore("shipments").get(r.shipmentId)) as Shipment;
    assertOpen(s);
    await tx.objectStore("receipts").put({ ...r, reversed: true, reversalReason: reason.trim(), reversedAt: nowIso() });
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId: r.shipmentId,
      clientId: r.clientId,
      actorId,
      type: "receipt.reversed",
      summary: `Receipt ${r.bankReference} (${formatMoney(r.amount, r.currency)}) reversed: ${reason}`,
      clientSummary: `A payment of ${formatMoney(r.amount, r.currency)} was reversed. Please contact Divine Freight.`,
    });
    return { ok: true };
  });
}

export const disbursementSchema = z.object({
  shipmentId: z.string(),
  category: z.enum(DISBURSEMENT_CATEGORIES),
  payee: text("Payee", 120),
  amount,
  currency,
  paidOn: isoDate("Payment date"),
  reference: text("Payment reference", 60),
  prefundReason: optText(300).optional(),
});
export type DisbursementInput = z.input<typeof disbursementSchema>;

export async function recordDisbursement(actorId: string, input: DisbursementInput, opId: string) {
  const data = parse(disbursementSchema, input);
  if (data.paidOn > todayISO()) throw new ValidationError({ paidOn: "Payment date cannot be in the future." });
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, FINANCE_ROLES);
    const s = await shipmentFor(tx, actor, data.shipmentId);
    assertOpen(s);
    const ctx = await txSnapshotFor(tx, s);
    const available = availableClientFunds(ctx.finance, data.currency);
    let prefunded = false;
    if (data.amount > available) {
      const msg = `Exceeds verified client funds available (${formatMoney(available, data.currency)}).`;
      if (data.category === "client_refund") throw new ValidationError({ amount: `A refund cannot exceed client funds held. ${msg}` });
      if (!data.prefundReason)
        throw new ValidationError({
          amount: `${msg} A supervisor may pre-fund with a recorded reason; the shortfall becomes an unrecovered disbursement.`,
        });
      if (actor.role !== "operations_supervisor")
        throw new ForbiddenError("Only an operations supervisor can pre-fund a disbursement.");
      prefunded = true;
    }
    const d: Disbursement = {
      id: newId("dsb"),
      shipmentId: s.id,
      clientId: s.clientId,
      category: data.category,
      payee: data.payee,
      amount: data.amount,
      currency: data.currency,
      paidOn: data.paidOn,
      reference: data.reference,
      prefunded,
      prefundReason: prefunded ? (data.prefundReason ?? null) : null,
      recordedById: actorId,
      recordedAt: nowIso(),
    };
    await tx.objectStore("disbursements").put(d);
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId: s.id,
      clientId: s.clientId,
      actorId,
      type: "disbursement.recorded",
      summary: `Disbursement ${formatMoney(d.amount, d.currency)} to ${d.payee}${prefunded ? ` — PRE-FUNDED: ${d.prefundReason}` : ""}`,
      clientSummary:
        d.category === "client_refund"
          ? `Refund of ${formatMoney(d.amount, d.currency)} sent to you`
          : `Paid ${formatMoney(d.amount, d.currency)} to ${d.payee} on your behalf`,
    });
    return { disbursementId: d.id, prefunded };
  });
}

export const invoiceLineSchema = z.object({
  shipmentId: z.string(),
  description: text("Description", 120),
  amount,
  currency,
});
export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;

export async function addInvoiceLine(actorId: string, input: InvoiceLineInput, opId: string) {
  const data = parse(invoiceLineSchema, input);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, FINANCE_ROLES);
    const s = await shipmentFor(tx, actor, data.shipmentId);
    assertOpen(s);
    const invoices = await byShipment<Invoice>(tx, "invoices", s.id);
    let inv = invoices.find((i) => i.status === "draft");
    if (!inv) {
      if (invoices.some((i) => i.status === "issued"))
        throw new DomainError("invoice_issued", "The service invoice is already issued and cannot be changed.");
      const all = (await tx.objectStore("invoices").getAll()) as Invoice[];
      const max = all.reduce((m, i) => Math.max(m, Number(/(\d+)$/.exec(i.number)?.[1] ?? 0)), 300);
      inv = { id: newId("inv"), shipmentId: s.id, clientId: s.clientId, number: `INV-2026-${max + 1}`, currency: data.currency, status: "draft", issuedAt: null, createdAt: nowIso() };
      await tx.objectStore("invoices").put(inv);
    }
    if (inv.currency !== data.currency)
      throw new ValidationError({ currency: `This invoice is in ${inv.currency}. Lines cannot mix currencies.` });
    await tx.objectStore("invoiceLines").put({ id: newId("il"), invoiceId: inv.id, description: data.description, amount: data.amount });
    await addActivity(tx, { shipmentId: s.id, clientId: s.clientId, actorId, type: "invoice.line_added", summary: `Invoice line added: ${data.description} ${formatMoney(data.amount, data.currency)}`, clientSummary: null });
    return { invoiceId: inv.id };
  });
}

export async function removeInvoiceLine(actorId: string, lineId: string) {
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, FINANCE_ROLES);
    const line = (await tx.objectStore("invoiceLines").get(lineId)) as InvoiceLine | undefined;
    if (!line) throw new NotFoundError("Invoice line");
    const inv = (await tx.objectStore("invoices").get(line.invoiceId)) as Invoice;
    if (inv.status !== "draft") throw new DomainError("invoice_issued", "Issued invoices cannot be changed.");
    await tx.objectStore("invoiceLines").delete(lineId);
    await addActivity(tx, { shipmentId: inv.shipmentId, clientId: inv.clientId, actorId, type: "invoice.line_removed", summary: `Invoice line removed: ${line.description}`, clientSummary: null });
    return { ok: true };
  });
}

export async function issueInvoice(actorId: string, invoiceId: string) {
  return mutate(undefined, async (tx) => {
    await actorOf(tx, actorId, FINANCE_ROLES);
    const inv = (await tx.objectStore("invoices").get(invoiceId)) as Invoice | undefined;
    if (!inv) throw new NotFoundError("Invoice");
    if (inv.status === "issued") throw new DomainError("invoice_issued", "Invoice already issued.");
    const lines = ((await tx.objectStore("invoiceLines").getAll()) as InvoiceLine[]).filter((l) => l.invoiceId === inv.id);
    if (lines.length === 0) throw new DomainError("invoice_empty", "Add at least one service line before issuing.");
    const total = lines.reduce((s, l) => s + l.amount, 0);
    await tx.objectStore("invoices").put({ ...inv, status: "issued", issuedAt: nowIso() });
    const s = (await tx.objectStore("shipments").get(inv.shipmentId)) as Shipment;
    await touch(tx, s);
    await addActivity(tx, {
      shipmentId: inv.shipmentId,
      clientId: inv.clientId,
      actorId,
      type: "invoice.issued",
      summary: `Invoice ${inv.number} issued: ${formatMoney(total, inv.currency)}`,
      clientSummary: `Invoice ${inv.number} issued: ${formatMoney(total, inv.currency)}`,
    });
    return { ok: true };
  });
}

export const costSchema = z.object({
  shipmentId: z.string(),
  description: text("Description", 120),
  amount,
  currency,
  incurredOn: isoDate("Date"),
});
export type CostInput = z.input<typeof costSchema>;

export async function addOperationalCost(actorId: string, input: CostInput, opId: string) {
  const data = parse(costSchema, input);
  return mutate(opId, async (tx) => {
    const actor = await actorOf(tx, actorId, FINANCE_ROLES);
    const s = await shipmentFor(tx, actor, data.shipmentId);
    await tx.objectStore("costs").put({ id: newId("cost"), ...data });
    await addActivity(tx, { shipmentId: s.id, clientId: s.clientId, actorId, type: "cost.recorded", summary: `Operational cost recorded: ${data.description} ${formatMoney(data.amount, data.currency)}`, clientSummary: null });
    return { ok: true };
  });
}

/* =================================================================== demo reset */

export async function resetDemoData() {
  await resetDatabase();
  return { ok: true };
}

/** Exposed for the atomicity test only: runs `fn` in the same all-or-nothing transaction used by every mutation. */
export const runAtomicForTests = mutate;

/* =================================================================== guided demo */

export const GUIDED_REFERENCE = "DF-DEMO-2026-001";

/**
 * Presenter aid: progress of the guided demo shipment, derived from stored records.
 * Returns only step completion flags and the record id (no business content).
 */
export async function getGuideStatus() {
  const snap = await loadSnapshot();
  const s = snap.shipments.find((x) => x.reference === GUIDED_REFERENCE);
  if (!s) return { shipmentId: null, done: {} as Record<string, boolean> };
  const own = <T extends { shipmentId: string | null }>(xs: T[]) => xs.filter((x) => x.shipmentId === s.id);
  const reqs = own(snap.requirements);
  const docs = own(snap.documents);
  const i = STAGES.indexOf(s.stage);
  const at = (stage: (typeof STAGES)[number]) => i >= STAGES.indexOf(stage);
  const invoices = own(snap.invoices);
  const issued = invoices.find((x) => x.status === "issued");
  const receipts = own(snap.receipts).filter((r) => !r.reversed);
  const ex = own(snap.exceptions).filter((e) => e.category === "external_delay");
  return {
    shipmentId: s.id,
    done: {
      request: true,
      assign: !!s.assignedOfficerId,
      preparation: at("preparation"),
      clientUpload: reqs.every((r) => docs.some((d) => d.requirementId === r.id)),
      review: buildRows({ ...snap, shipments: [s] }, todayISO())[0].readiness.status === "complete",
      submitted: at("submitted"),
      delay: ex.length > 0,
      management: ex.length > 0,
      funding: own(snap.fundingRequests).length > 0,
      notify: own(snap.notifications).some((n) => n.target.kind === "funding_request"),
      verify: receipts.some((r) => r.allocation.kind === "client_funds"),
      disburse: own(snap.disbursements).length > 0,
      released: at("released"),
      delivered: at("delivered"),
      invoice: !!issued && receipts.some((r) => r.allocation.kind === "invoice"),
      closed: s.stage === "closed",
    } as Record<string, boolean>,
  };
}
