import type {
  DisbursementCategory,
  DocType,
  DocumentStatus,
  ExceptionCategory,
  ShipmentCategory,
  Stage,
  TransportMode,
} from "./types";
import type { FundingRequestStatus } from "./finance";
import type { RequirementState } from "./rules";

export const STAGE_LABEL: Record<Stage, string> = {
  new_request: "New request",
  preparation: "Preparation",
  ready_for_submission: "Ready for submission",
  submitted: "Submitted",
  released: "Released",
  in_delivery: "In delivery",
  delivered: "Delivered",
  closed: "Closed",
};

/** Plain-language milestone wording for the client portal. */
export const STAGE_CLIENT_LABEL: Record<Stage, string> = {
  new_request: "Request received",
  preparation: "Preparing documents",
  ready_for_submission: "Documents ready",
  submitted: "Lodged with customs",
  released: "Released by customs",
  in_delivery: "On the way to you",
  delivered: "Delivered",
  closed: "File closed",
};

export const CATEGORY_LABEL: Record<ShipmentCategory, string> = {
  import: "Import",
  export: "Export",
  transit: "Transit",
};

export const MODE_LABEL: Record<TransportMode, string> = {
  road: "Road",
  sea_road: "Sea + road",
  air: "Air",
  rail: "Rail",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  commercial_invoice: "Commercial invoice",
  packing_list: "Packing list",
  transport_document: "Transport document",
  certificate_of_origin: "Certificate of origin",
  client_authority: "Client authority to act",
  release_evidence: "Release evidence",
  proof_of_delivery: "Proof of delivery",
  other: "Other",
};

export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending_review: "Awaiting review",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const REQUIREMENT_STATE_LABEL: Record<RequirementState, string> = {
  missing: "Missing",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected — resubmit",
};

export const EXCEPTION_CATEGORY_LABEL: Record<ExceptionCategory, string> = {
  external_delay: "External processing delay",
  document_issue: "Document issue",
  funding: "Funding issue",
  operational: "Operational",
};

export const DISBURSEMENT_CATEGORY_LABEL: Record<DisbursementCategory, string> = {
  duty: "Customs duty",
  vat: "Import VAT",
  port_charges: "Port / terminal charges",
  transport: "Transport",
  storage: "Storage",
  client_refund: "Refund to client",
  other: "Other",
};

export const FUNDING_STATUS_LABEL: Record<FundingRequestStatus, string> = {
  cancelled: "Cancelled",
  awaiting_payment: "Awaiting payment",
  payment_notified: "Payment notified — unverified",
  partially_funded: "Partially funded",
  funded: "Funded",
};

export const STATUS_SOURCE_LABEL = {
  manually_recorded: "Manually recorded",
  simulated_demo: "Simulated demonstration",
} as const;
