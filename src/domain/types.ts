// DFOS domain model. All monetary amounts are integer minor units (cents)
// with an explicit ISO currency code. Timestamps are ISO-8601 strings.

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export const CURRENCIES = ["USD", "ZAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Client {
  id: ID;
  name: string;
  shortName: string;
  code: string; // used in references
}

export type UserRole = "officer" | "operations_supervisor" | "finance" | "management" | "client";

export interface User {
  id: ID;
  name: string;
  role: UserRole;
  title: string;
  clientId?: ID; // client users only
}

export const SHIPMENT_CATEGORIES = ["import", "export", "transit"] as const;
export type ShipmentCategory = (typeof SHIPMENT_CATEGORIES)[number];

export const TRANSPORT_MODES = ["road", "sea_road", "air", "rail"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const STAGES = [
  "new_request",
  "preparation",
  "ready_for_submission",
  "submitted",
  "released",
  "in_delivery",
  "delivered",
  "closed",
] as const;
export type Stage = (typeof STAGES)[number];

export interface Shipment {
  id: ID;
  reference: string; // human-readable file reference
  clientId: ID;
  description: string;
  category: ShipmentCategory;
  mode: TransportMode;
  origin: string;
  destination: string;
  borderPost: string; // border or processing location
  assignedOfficerId: ID | null;
  stage: Stage;
  externalReference: string | null; // e.g. customs submission reference (manually recorded)
  expectedArrival: ISODate | null;
  expectedDelivery: ISODate | null;
  clientReference: string | null; // client's PO / order ref
  internalNotes: string; // never shown to clients
  isGuidedDemo: boolean;
  version: number; // optimistic concurrency
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Milestone {
  id: ID;
  shipmentId: ID;
  stage: Stage;
  at: ISODateTime;
  byUserId: ID;
  note: string | null;
  override: boolean;
}

export const DOC_TYPES = [
  "commercial_invoice",
  "packing_list",
  "transport_document",
  "certificate_of_origin",
  "client_authority",
  "release_evidence",
  "proof_of_delivery",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface DocumentRequirement {
  id: ID;
  shipmentId: ID;
  docType: DocType;
  label: string;
  required: boolean;
  createdAt: ISODateTime;
}

export type DocumentStatus = "pending_review" | "accepted" | "rejected";

export interface ShipmentDocument {
  id: ID;
  shipmentId: ID;
  clientId: ID;
  requirementId: ID | null; // null for stage evidence (release / delivery)
  docType: DocType;
  fileName: string;
  mimeType: string;
  size: number;
  blobId: ID;
  uploadedById: ID;
  uploadedAt: ISODateTime;
  status: DocumentStatus;
  reviewedById: ID | null;
  reviewedAt: ISODateTime | null;
  rejectionReason: string | null;
  clientVisible: boolean;
}

export interface DocumentBlob {
  id: ID;
  data: ArrayBuffer;
  mimeType: string;
}

export interface Task {
  id: ID;
  shipmentId: ID;
  title: string;
  assigneeId: ID;
  dueDate: ISODate;
  status: "open" | "done";
  blocking: boolean; // blocks closure while open
  exceptionId: ID | null;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export const EXCEPTION_CATEGORIES = ["external_delay", "document_issue", "funding", "operational"] as const;
export type ExceptionCategory = (typeof EXCEPTION_CATEGORIES)[number];

export interface ShipmentException {
  id: ID;
  shipmentId: ID;
  category: ExceptionCategory;
  authority: string | null; // external party, e.g. "Customs — Beitbridge" (manually recorded)
  description: string;
  ownerId: ID;
  nextAction: string;
  followUpDate: ISODate;
  status: "open" | "resolved";
  statusSource: "manually_recorded" | "simulated_demo";
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
  resolution: string | null;
}

export interface FundingRequest {
  id: ID;
  shipmentId: ID;
  clientId: ID;
  purpose: string;
  amount: number; // minor units
  currency: Currency;
  dueDate: ISODate;
  cancelled: boolean;
  createdById: ID;
  createdAt: ISODateTime;
}

/** A client's claim that it has paid. Never counts as available funds. */
export interface PaymentNotification {
  id: ID;
  shipmentId: ID;
  clientId: ID;
  target: { kind: "funding_request"; fundingRequestId: ID } | { kind: "invoice"; invoiceId: ID };
  amount: number;
  currency: Currency;
  payerReference: string;
  paidOn: ISODate;
  status: "notified" | "verified" | "rejected";
  notifiedById: ID;
  notifiedAt: ISODateTime;
  resolvedById: ID | null;
  resolvedAt: ISODateTime | null;
  rejectionReason: string | null;
}

/** Money actually confirmed as received by Divine Freight finance. */
export interface Receipt {
  id: ID;
  shipmentId: ID;
  clientId: ID;
  allocation: { kind: "client_funds"; fundingRequestId: ID | null } | { kind: "invoice"; invoiceId: ID };
  notificationId: ID | null;
  amount: number;
  currency: Currency;
  bankReference: string;
  receivedOn: ISODate;
  verifiedById: ID;
  verifiedAt: ISODateTime;
  reversed: boolean;
  reversalReason: string | null;
  reversedAt: ISODateTime | null;
}

export const DISBURSEMENT_CATEGORIES = ["duty", "vat", "port_charges", "transport", "storage", "client_refund", "other"] as const;
export type DisbursementCategory = (typeof DISBURSEMENT_CATEGORIES)[number];

/** Pass-through payment made on the client's behalf (client money, not revenue). */
export interface Disbursement {
  id: ID;
  shipmentId: ID;
  clientId: ID;
  category: DisbursementCategory;
  payee: string;
  amount: number;
  currency: Currency;
  paidOn: ISODate;
  reference: string;
  prefunded: boolean; // paid beyond available client funds (supervisor override)
  prefundReason: string | null;
  recordedById: ID;
  recordedAt: ISODateTime;
}

export interface Invoice {
  id: ID;
  shipmentId: ID;
  clientId: ID;
  number: string;
  currency: Currency;
  status: "draft" | "issued";
  issuedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface InvoiceLine {
  id: ID;
  invoiceId: ID;
  description: string;
  amount: number; // service revenue, minor units
}

/** Divine Freight's own cost of handling the file (not recoverable from client). */
export interface OperationalCost {
  id: ID;
  shipmentId: ID;
  description: string;
  amount: number;
  currency: Currency;
  incurredOn: ISODate;
}

export interface ActivityEvent {
  id: ID;
  shipmentId: ID | null;
  clientId: ID | null;
  at: ISODateTime;
  actorId: ID;
  type: string;
  summary: string; // internal wording
  clientSummary: string | null; // non-null => visible to the client, using this wording
}

export type Viewer = { kind: "staff"; userId: ID } | { kind: "client"; userId: ID; clientId: ID };
