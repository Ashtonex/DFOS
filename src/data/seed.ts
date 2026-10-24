// Deterministic fictional demonstration data. Dates are offsets from the seed
// moment, so "overdue" items stay overdue relative to when the demo was reset.
// All names, companies and references are fictional.
import { REQUIRED_DOCS_BY_CATEGORY, addDaysISO, todayISO } from "@/domain/rules";
import type {
  ActivityEvent,
  Client,
  Currency,
  DisbursementCategory,
  Disbursement,
  DocType,
  DocumentBlob,
  DocumentRequirement,
  FundingRequest,
  Invoice,
  InvoiceLine,
  Milestone,
  OperationalCost,
  PaymentNotification,
  Receipt,
  Shipment,
  ShipmentCategory,
  ShipmentDocument,
  ShipmentException,
  Stage,
  Task,
  TransportMode,
  User,
} from "@/domain/types";
import { STAGES } from "@/domain/types";
import { STAGE_CLIENT_LABEL, STAGE_LABEL, DOC_TYPE_LABEL } from "@/domain/labels";
import { makePdf } from "./samplePdf";

export interface SeedData {
  seededAt: string;
  clients: Client[];
  users: User[];
  shipments: Shipment[];
  milestones: Milestone[];
  requirements: DocumentRequirement[];
  documents: ShipmentDocument[];
  blobs: DocumentBlob[];
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

export const CLIENTS: Client[] = [
  { id: "c-ehis", name: "Eastern Highlands Industrial Supplies", shortName: "EH Industrial", code: "EHIS" },
  { id: "c-kap", name: "Kariba Agro Processors", shortName: "Kariba Agro", code: "KAP" },
  { id: "c-zmd", name: "Zambezi Medical Distributors", shortName: "Zambezi Medical", code: "ZMD" },
];

export const USERS: User[] = [
  { id: "u-rudo", name: "Rudo Chikore", role: "operations_supervisor", title: "Operations Supervisor" },
  { id: "u-tendai", name: "Tendai Moyo", role: "officer", title: "Clearance Officer" },
  { id: "u-farai", name: "Farai Ndlovu", role: "officer", title: "Clearance Officer" },
  { id: "u-chipo", name: "Chipo Mutasa", role: "officer", title: "Clearance Officer" },
  { id: "u-nyasha", name: "Nyasha Banda", role: "finance", title: "Finance Officer" },
  { id: "u-tafadzwa", name: "Tafadzwa Mhlanga", role: "management", title: "Managing Director" },
  { id: "u-grace", name: "Grace Mukoko", role: "client", title: "Procurement Manager", clientId: "c-ehis" },
  { id: "u-peter", name: "Peter Zhou", role: "client", title: "Logistics Lead", clientId: "c-kap" },
  { id: "u-ruvimbo", name: "Ruvimbo Dube", role: "client", title: "Supply Chain Coordinator", clientId: "c-zmd" },
];

type DocPlan = "accepted" | "rejected" | "rejected_then_accepted" | "pending" | "rejected_then_pending" | "missing";

interface ShipSpec {
  n: string;
  clientId: string;
  description: string;
  category: ShipmentCategory;
  mode: TransportMode;
  origin: string;
  destination: string;
  borderPost: string;
  officerId: string | null;
  stage: Stage;
  createdDaysAgo: number;
  extRef?: string;
  clientRef?: string;
  notes?: string;
  docs?: Partial<Record<DocType, DocPlan>>; // default: accepted
  eta?: number; // days from seed date
}

export function buildSeed(now: Date): SeedData {
  const nowMs = now.getTime();
  const today = todayISO(now);
  const day = (offset: number) => addDaysISO(today, offset);
  const at = (daysAgo: number, hours = 0) => new Date(nowMs - daysAgo * 86400000 + hours * 3600000).toISOString();

  const d: SeedData = {
    seededAt: now.toISOString(),
    clients: CLIENTS,
    users: USERS,
    shipments: [],
    milestones: [],
    requirements: [],
    documents: [],
    blobs: [],
    tasks: [],
    exceptions: [],
    fundingRequests: [],
    notifications: [],
    receipts: [],
    disbursements: [],
    invoices: [],
    invoiceLines: [],
    costs: [],
    activity: [],
  };
  let seq = 0;
  const id = (prefix: string) => `${prefix}-s${String(++seq).padStart(4, "0")}`;
  const clientOf = (cid: string) => CLIENTS.find((c) => c.id === cid)!;
  const clientUser = (cid: string) => USERS.find((u) => u.clientId === cid)!.id;

  const event = (
    s: Shipment,
    atIso: string,
    actorId: string,
    type: string,
    summary: string,
    clientSummary: string | null,
  ) => d.activity.push({ id: id("act"), shipmentId: s.id, clientId: s.clientId, at: atIso, actorId, type, summary, clientSummary });

  const addDoc = (
    s: Shipment,
    docType: DocType,
    status: ShipmentDocument["status"],
    uploadedAt: string,
    opts: { requirementId: string | null; uploadedBy: string; reviewer?: string; reason?: string; fileName?: string },
  ) => {
    const blobId = id("blob");
    const fileName = opts.fileName ?? `${s.reference}-${docType.replace(/_/g, "-")}.pdf`;
    d.blobs.push({
      id: blobId,
      mimeType: "application/pdf",
      data: makePdf(`${DOC_TYPE_LABEL[docType]} - ${s.reference}`, [
        "FICTIONAL DEMONSTRATION DOCUMENT - NOT A REAL TRADE RECORD",
        `Client: ${clientOf(s.clientId).name}`,
        `Goods: ${s.description}`,
        `Route: ${s.origin} -> ${s.borderPost} -> ${s.destination}`,
        "Generated by DFOS demo seed (Flectere prototype).",
      ]),
    });
    const doc: ShipmentDocument = {
      id: id("doc"),
      shipmentId: s.id,
      clientId: s.clientId,
      requirementId: opts.requirementId,
      docType,
      fileName,
      mimeType: "application/pdf",
      size: d.blobs[d.blobs.length - 1].data.byteLength,
      blobId,
      uploadedById: opts.uploadedBy,
      uploadedAt,
      status,
      reviewedById: status === "pending_review" ? null : (opts.reviewer ?? s.assignedOfficerId ?? "u-rudo"),
      reviewedAt: status === "pending_review" ? null : new Date(Date.parse(uploadedAt) + 3 * 3600000).toISOString(),
      rejectionReason: status === "rejected" ? (opts.reason ?? "Illegible scan — please resubmit a clear copy.") : null,
      clientVisible: true,
    };
    d.documents.push(doc);
    return doc;
  };

  const ships: Record<string, Shipment> = {};
  let lodgementSeq = 0;

  const ship = (spec: ShipSpec) => {
    const created = at(spec.createdDaysAgo);
    const s: Shipment = {
      id: `shp-${spec.n}`,
      reference: `DF-2026-${spec.n}`,
      clientId: spec.clientId,
      description: spec.description,
      category: spec.category,
      mode: spec.mode,
      origin: spec.origin,
      destination: spec.destination,
      borderPost: spec.borderPost,
      assignedOfficerId: spec.officerId,
      stage: spec.stage,
      lodgementReference: null,
      externalReference: spec.extRef ?? null,
      expectedArrival: spec.eta !== undefined ? day(spec.eta) : null,
      expectedDelivery: spec.eta !== undefined ? day(spec.eta + 3) : null,
      clientReference: spec.clientRef ?? null,
      internalNotes: spec.notes ?? "",
      isGuidedDemo: false,
      version: 1,
      createdAt: created,
      updatedAt: created,
    };
    ships[spec.n] = s;
    d.shipments.push(s);
    const cu = clientUser(s.clientId);
    event(s, created, cu, "shipment.requested", `Shipment request submitted by client`, "Shipment request submitted");

    // requirements + documents
    const reqs = REQUIRED_DOCS_BY_CATEGORY[s.category].map((r) => ({
      id: id("req"),
      shipmentId: s.id,
      docType: r.docType,
      label: r.label,
      required: true,
      createdAt: created,
    }));
    d.requirements.push(...reqs);
    reqs.forEach((req, i) => {
      const plan: DocPlan = spec.docs?.[req.docType] ?? "accepted";
      const up = at(spec.createdDaysAgo - 0.2 - i * 0.05);
      const opts = { requirementId: req.id, uploadedBy: cu };
      if (plan === "missing") return;
      if (plan.startsWith("rejected")) {
        addDoc(s, req.docType, "rejected", up, {
          ...opts,
          fileName: `${req.docType.replace(/_/g, "-")}-scan.pdf`,
          reason:
            req.docType === "certificate_of_origin"
              ? "Certificate is unsigned. Please provide the signed and stamped original."
              : "Values do not match the packing list. Please resubmit a corrected copy.",
        });
        event(s, up, s.assignedOfficerId ?? "u-rudo", "document.rejected", `${req.label} rejected`, `${req.label} needs to be resubmitted`);
      }
      const later = at(spec.createdDaysAgo - 1 - i * 0.05);
      if (plan === "accepted" || plan === "rejected_then_accepted") {
        addDoc(s, req.docType, "accepted", plan === "accepted" ? up : later, opts);
      } else if (plan === "pending" || plan === "rejected_then_pending") {
        addDoc(s, req.docType, "pending_review", plan === "pending" ? up : later, opts);
      }
    });

    // milestones up to current stage
    const reached = STAGES.slice(0, STAGES.indexOf(s.stage) + 1);
    reached.forEach((stage, i) => {
      const t = at(spec.createdDaysAgo - (i * spec.createdDaysAgo) / Math.max(reached.length, 2), i === 0 ? 0 : 1);
      d.milestones.push({
        id: id("ms"),
        shipmentId: s.id,
        stage,
        at: i === 0 ? created : t,
        byUserId: i === 0 ? cu : (s.assignedOfficerId ?? "u-rudo"),
        note:
          stage === "submitted"
            ? `DFOS lodgement reference ${(s.lodgementReference = `DF-LDG-${now.getFullYear()}-${String(++lodgementSeq).padStart(4, "0")}`)}; customs reference ${s.externalReference} (manually recorded)`
            : null,
        override: false,
      });
      if (i > 0)
        event(
          s,
          t,
          s.assignedOfficerId ?? "u-rudo",
          "stage.changed",
          `Stage changed to ${STAGE_LABEL[stage]}`,
          STAGE_CLIENT_LABEL[stage],
        );
      if (stage === "released")
        addDoc(s, "release_evidence", "accepted", t, {
          requirementId: null,
          uploadedBy: s.assignedOfficerId ?? "u-rudo",
          fileName: `${s.reference}-release-order.pdf`,
        });
      if (stage === "delivered")
        addDoc(s, "proof_of_delivery", "accepted", t, {
          requirementId: null,
          uploadedBy: s.assignedOfficerId ?? "u-rudo",
          fileName: `${s.reference}-signed-pod.pdf`,
        });
    });
    if (s.assignedOfficerId)
      event(
        s,
        at(spec.createdDaysAgo - 0.1),
        "u-rudo",
        "shipment.assigned",
        `Assigned to ${USERS.find((u) => u.id === s.assignedOfficerId)!.name}`,
        `A clearance officer (${USERS.find((u) => u.id === s.assignedOfficerId)!.name}) is handling your file`,
      );
    s.updatedAt = d.milestones.filter((m) => m.shipmentId === s.id).at(-1)!.at;
    return s;
  };

  // ---------------------------------------------------------------- finance helpers
  const funding = (s: Shipment, purpose: string, amount: number, daysAgo: number, dueIn: number, currency: Currency = "USD") => {
    const fr: FundingRequest = {
      id: id("fr"),
      shipmentId: s.id,
      clientId: s.clientId,
      purpose,
      amount,
      currency,
      dueDate: day(dueIn),
      cancelled: false,
      createdById: "u-rudo",
      createdAt: at(daysAgo),
    };
    d.fundingRequests.push(fr);
    event(s, fr.createdAt, "u-rudo", "funding.requested", `Funding requested: ${purpose}`, `Funding requested: ${purpose}`);
    return fr;
  };
  const notify = (
    s: Shipment,
    target: PaymentNotification["target"],
    amount: number,
    daysAgo: number,
    status: PaymentNotification["status"],
    currency: Currency = "USD",
  ) => {
    const n: PaymentNotification = {
      id: id("pn"),
      shipmentId: s.id,
      clientId: s.clientId,
      target,
      amount,
      currency,
      payerReference: `${clientOf(s.clientId).code}-EFT-${String(seq).padStart(5, "0")}`,
      paidOn: day(-Math.ceil(daysAgo)),
      status,
      notifiedById: clientUser(s.clientId),
      notifiedAt: at(daysAgo),
      resolvedById: status === "notified" ? null : "u-nyasha",
      resolvedAt: status === "notified" ? null : at(daysAgo - 0.5),
      rejectionReason: null,
      popDocumentId: null,
    };
    // Clients attach proof of payment (a bank confirmation PDF) with their notification.
    n.popDocumentId = addDoc(s, "proof_of_payment", status === "notified" ? "pending_review" : status === "verified" ? "accepted" : "rejected", n.notifiedAt, {
      requirementId: null,
      uploadedBy: n.notifiedById,
      reviewer: "u-nyasha",
      fileName: `${n.payerReference}-bank-confirmation.pdf`,
    }).id;
    d.notifications.push(n);
    event(s, n.notifiedAt, n.notifiedById, "payment.notified", "Client notified a payment", "You notified a payment");
    return n;
  };
  const receipt = (
    s: Shipment,
    allocation: Receipt["allocation"],
    amount: number,
    daysAgo: number,
    notificationId: string | null,
    currency: Currency = "USD",
  ) => {
    const r: Receipt = {
      id: id("rcpt"),
      shipmentId: s.id,
      clientId: s.clientId,
      allocation,
      notificationId,
      amount,
      currency,
      bankReference: `BNK-${s.reference.slice(-4)}-${String(seq).padStart(4, "0")}`,
      receivedOn: day(-Math.ceil(daysAgo)),
      verifiedById: "u-nyasha",
      verifiedAt: at(daysAgo),
      reversed: false,
      reversalReason: null,
      reversedAt: null,
    };
    d.receipts.push(r);
    event(s, r.verifiedAt, "u-nyasha", "receipt.verified", "Receipt verified against bank statement", "Payment received and confirmed");
    return r;
  };
  const fundAndVerify = (s: Shipment, fr: FundingRequest, amount: number, daysAgo: number) => {
    const n = notify(s, { kind: "funding_request", fundingRequestId: fr.id }, amount, daysAgo + 0.5, "verified", fr.currency);
    receipt(s, { kind: "client_funds", fundingRequestId: fr.id }, amount, daysAgo, n.id, fr.currency);
  };
  const disburse = (
    s: Shipment,
    category: DisbursementCategory,
    payee: string,
    amount: number,
    daysAgo: number,
    prefundReason: string | null = null,
    currency: Currency = "USD",
  ) => {
    d.disbursements.push({
      id: id("dsb"),
      shipmentId: s.id,
      clientId: s.clientId,
      category,
      payee,
      amount,
      currency,
      paidOn: day(-Math.ceil(daysAgo)),
      reference: `PAY-${s.reference.slice(-4)}-${String(seq).padStart(4, "0")}`,
      prefunded: prefundReason !== null,
      prefundReason,
      recordedById: "u-nyasha",
      recordedAt: at(daysAgo),
    });
    event(s, at(daysAgo), "u-nyasha", "disbursement.recorded", `Disbursement recorded: ${payee}`, `Payment made on your behalf: ${payee}`);
  };
  let invSeq = 300;
  const invoice = (s: Shipment, lines: [string, number][], issuedDaysAgo: number | null, currency: Currency = "USD") => {
    const inv: Invoice = {
      id: id("inv"),
      shipmentId: s.id,
      clientId: s.clientId,
      number: `INV-2026-${++invSeq}`,
      currency,
      status: issuedDaysAgo === null ? "draft" : "issued",
      issuedAt: issuedDaysAgo === null ? null : at(issuedDaysAgo),
      createdAt: at(issuedDaysAgo ?? 1),
    };
    d.invoices.push(inv);
    for (const [description, amount] of lines) d.invoiceLines.push({ id: id("il"), invoiceId: inv.id, description, amount });
    if (inv.issuedAt) event(s, inv.issuedAt, "u-nyasha", "invoice.issued", `Invoice ${inv.number} issued`, `Invoice ${inv.number} issued`);
    return inv;
  };
  const cost = (s: Shipment, description: string, amount: number, daysAgo: number) =>
    d.costs.push({ id: id("cost"), shipmentId: s.id, description, amount, currency: "USD", incurredOn: day(-daysAgo) });
  const task = (s: Shipment, title: string, assigneeId: string, dueIn: number, opts: Partial<Task> = {}) => {
    const t: Task = {
      id: id("task"),
      shipmentId: s.id,
      title,
      assigneeId,
      dueDate: day(dueIn),
      status: "open",
      blocking: true,
      exceptionId: null,
      createdAt: at(Math.max(1, -dueIn + 2)),
      completedAt: null,
      ...opts,
    };
    d.tasks.push(t);
    return t;
  };
  const exception = (s: Shipment, e: Omit<ShipmentException, "id" | "shipmentId" | "statusSource" | "resolvedAt" | "resolution">, resolved?: { daysAgo: number; resolution: string }) => {
    const ex: ShipmentException = {
      id: id("exc"),
      shipmentId: s.id,
      statusSource: "manually_recorded",
      resolvedAt: resolved ? at(resolved.daysAgo) : null,
      resolution: resolved?.resolution ?? null,
      ...e,
    };
    d.exceptions.push(ex);
    event(
      s,
      ex.createdAt,
      ex.ownerId,
      "exception.recorded",
      `Exception recorded: ${ex.description}`,
      ex.category === "external_delay" ? "External processing delay recorded. Our team is following up." : null,
    );
    return ex;
  };

  // ---------------------------------------------------------------- shipments
  const s101 = ship({
    n: "0101", clientId: "c-ehis", description: "Conveyor belt rollers and idlers", category: "import", mode: "road",
    origin: "Durban", destination: "Mutare", borderPost: "Beitbridge", officerId: "u-tendai", stage: "preparation",
    createdDaysAgo: 6, clientRef: "EH-PO-7781", eta: 4,
    docs: { transport_document: "missing", certificate_of_origin: "rejected" },
    notes: "Client prefers updates by phone after 14:00.",
  });
  task(s101, "Chase signed certificate of origin from supplier", "u-tendai", -1);
  funding(s101, "Estimated duty and VAT deposit", 512000, 3, 2);

  const s102 = ship({
    n: "0102", clientId: "c-ehis", description: "Welding consumables and electrodes", category: "import", mode: "road",
    origin: "Johannesburg", destination: "Harare", borderPost: "Beitbridge", officerId: "u-farai", stage: "submitted",
    createdDaysAgo: 12, extRef: "BB-SUB-48213 (demo)", clientRef: "EH-PO-7702", eta: 1,
  });
  const fr102 = funding(s102, "Customs duty", 420000, 9, -6);
  fundAndVerify(s102, fr102, 420000, 7);
  disburse(s102, "duty", "Customs duty payment (demo)", 420000, 5);
  const ex102 = exception(s102, {
    category: "external_delay", authority: "Customs processing — Beitbridge", description: "Entry held pending physical inspection queue",
    ownerId: "u-farai", nextAction: "Call inspection desk and confirm slot", followUpDate: day(-2), status: "open", createdAt: at(4),
  });
  task(s102, "Follow up: inspection slot at Beitbridge", "u-farai", -2, { exceptionId: ex102.id });
  invoice(s102, [["Clearance service fee", 65000], ["Documentation handling", 15000]], null);

  const s103 = ship({
    n: "0103", clientId: "c-kap", description: "HDPE irrigation pipes (40 rolls)", category: "import", mode: "sea_road",
    origin: "Beira", destination: "Harare", borderPost: "Forbes (Mutare)", officerId: "u-chipo", stage: "ready_for_submission",
    createdDaysAgo: 9, clientRef: "KAP-2291", eta: 6,
  });
  funding(s103, "Customs duty and VAT", 680000, 2, 1);

  const s104 = ship({
    n: "0104", clientId: "c-kap", description: "Tobacco processing line spares", category: "import", mode: "air",
    origin: "Johannesburg (air)", destination: "Harare", borderPost: "Harare airport cargo", officerId: "u-tendai", stage: "released",
    createdDaysAgo: 15, extRef: "HRE-AIR-11872 (demo)", eta: -2,
  });
  const fr104 = funding(s104, "Duty, VAT and airport handling", 310000, 11, -8);
  fundAndVerify(s104, fr104, 100000, 9);
  notify(s104, { kind: "funding_request", fundingRequestId: fr104.id }, 210000, 1, "notified");
  disburse(s104, "duty", "Customs duty payment (demo)", 100000, 6);
  disburse(s104, "port_charges", "Airport cargo handling (demo)", 70000, 5, "Cargo would have incurred storage; supervisor approved pre-funding.");
  task(s104, "Recover pre-funded handling charges from client", "u-nyasha", 2);

  const s105 = ship({
    n: "0105", clientId: "c-zmd", description: "Medical consumables (syringes, gloves)", category: "import", mode: "road",
    origin: "Durban", destination: "Bulawayo", borderPost: "Beitbridge", officerId: "u-farai", stage: "in_delivery",
    createdDaysAgo: 14, extRef: "BB-SUB-47990 (demo)", eta: -3,
  });
  const fr105 = funding(s105, "Customs duty and VAT", 275000, 11, -7);
  fundAndVerify(s105, fr105, 275000, 9);
  disburse(s105, "vat", "Import VAT payment (demo)", 275000, 6);

  const s106 = ship({
    n: "0106", clientId: "c-zmd", description: "Laboratory reagents (cold chain)", category: "import", mode: "air",
    origin: "Johannesburg (air)", destination: "Harare", borderPost: "Harare airport cargo", officerId: "u-chipo", stage: "delivered",
    createdDaysAgo: 18, extRef: "HRE-AIR-11504 (demo)", eta: -8,
  });
  const fr106 = funding(s106, "Duty, VAT and cold storage", 198000, 16, -12);
  fundAndVerify(s106, fr106, 198000, 14);
  disburse(s106, "vat", "Import VAT payment (demo)", 150000, 12);
  disburse(s106, "storage", "Cold storage (demo)", 48000, 10);
  invoice(s106, [["Clearance service fee", 85000], ["Cold-chain coordination", 30000]], 3);
  cost(s106, "Courier and cold-box hire", 22000, 8);

  const s107 = ship({
    n: "0107", clientId: "c-ehis", description: "Mining drill bits and rods", category: "import", mode: "road",
    origin: "Johannesburg", destination: "Mutare", borderPost: "Beitbridge", officerId: "u-tendai", stage: "closed",
    createdDaysAgo: 30, extRef: "BB-SUB-46120 (demo)", eta: -20,
  });
  const fr107 = funding(s107, "Customs duty", 530000, 27, -23);
  fundAndVerify(s107, fr107, 530000, 25);
  disburse(s107, "duty", "Customs duty payment (demo)", 530000, 22);
  const inv107 = invoice(s107, [["Clearance service fee", 95000], ["Transport coordination", 40000]], 15);
  receipt(s107, { kind: "invoice", invoiceId: inv107.id }, 135000, 10, null);
  cost(s107, "Officer travel to Beitbridge", 18000, 21);
  cost(s107, "Bank charges", 2500, 22);

  const s108 = ship({
    n: "0108", clientId: "c-kap", description: "Packaged dried fruit (export)", category: "export", mode: "road",
    origin: "Harare", destination: "Lusaka", borderPost: "Chirundu", officerId: "u-chipo", stage: "closed",
    createdDaysAgo: 26, extRef: "CHR-EXP-3319 (demo)", eta: -18,
  });
  const fr108 = funding(s108, "Export permit and border fees", 86000, 24, -20);
  fundAndVerify(s108, fr108, 86000, 22);
  disburse(s108, "other", "Export permit and border fees (demo)", 86000, 20);
  const inv108 = invoice(s108, [["Export clearance fee", 45000]], 12);
  receipt(s108, { kind: "invoice", invoiceId: inv108.id }, 45000, 8, null);
  cost(s108, "Truck waiting charges absorbed (3 days)", 39000, 17);
  cost(s108, "Officer travel to Chirundu", 16000, 19);

  const s109 = ship({
    n: "0109", clientId: "c-zmd", description: "Hospital beds in transit to Zambia", category: "transit", mode: "road",
    origin: "Durban", destination: "Lusaka", borderPost: "Beitbridge / Chirundu", officerId: "u-chipo", stage: "preparation",
    createdDaysAgo: 5, eta: 7, docs: { transport_document: "missing", commercial_invoice: "rejected_then_pending" },
  });
  const ex109 = exception(s109, {
    category: "document_issue", authority: null, description: "Commercial invoice values differ from the transit bond declaration",
    ownerId: "u-chipo", nextAction: "Agree corrected invoice with supplier", followUpDate: day(-1), status: "open", createdAt: at(3),
  });
  task(s109, "Confirm corrected commercial invoice with client", "u-chipo", -1, { exceptionId: ex109.id });

  ship({
    n: "0110", clientId: "c-ehis", description: "Electrical switchgear panels", category: "import", mode: "sea_road",
    origin: "Durban", destination: "Harare", borderPost: "Beitbridge", officerId: null, stage: "new_request",
    createdDaysAgo: 1, eta: 12,
    docs: { commercial_invoice: "pending", packing_list: "pending", transport_document: "missing", certificate_of_origin: "missing", client_authority: "pending" },
  });

  const s111 = ship({
    n: "0111", clientId: "c-kap", description: "Grain dryer components", category: "import", mode: "road",
    origin: "Johannesburg", destination: "Chinhoyi", borderPost: "Beitbridge", officerId: "u-tendai", stage: "preparation",
    createdDaysAgo: 3, eta: 5, docs: { packing_list: "pending", certificate_of_origin: "pending" },
  });
  task(s111, "Review uploaded packing list and certificate", "u-tendai", 1);

  const s112 = ship({
    n: "0112", clientId: "c-zmd", description: "Diagnostic imaging equipment", category: "import", mode: "sea_road",
    origin: "Durban", destination: "Harare", borderPost: "Beitbridge", officerId: "u-farai", stage: "submitted",
    createdDaysAgo: 10, extRef: "BB-SUB-48077 (demo)", eta: 2,
  });
  funding(s112, "Import VAT", 945000, 4, -1);
  exception(
    s112,
    {
      category: "external_delay", authority: "Customs processing — Beitbridge", description: "Valuation query on declared value",
      ownerId: "u-farai", nextAction: "Provide supplier price list", followUpDate: day(-3), status: "resolved", createdAt: at(6),
    },
    { daysAgo: 3, resolution: "Price list accepted; query closed (manually recorded)." },
  );
  task(s112, "Confirm VAT funding with client", "u-farai", -1, { blocking: false });

  const s113 = ship({
    n: "0113", clientId: "c-ehis", description: "Pump spares and seals", category: "import", mode: "road",
    origin: "Durban", destination: "Mutare", borderPost: "Beitbridge", officerId: "u-farai", stage: "closed",
    createdDaysAgo: 24, extRef: "BB-SUB-46644 (demo)", eta: -15,
  });
  const fr113 = funding(s113, "Customs duty", 240000, 22, -18);
  fundAndVerify(s113, fr113, 260000, 20); // client overpaid by 200.00
  disburse(s113, "duty", "Customs duty payment (demo)", 240000, 17);
  disburse(s113, "client_refund", "Refund of overpayment to client", 20000, 12);
  const inv113 = invoice(s113, [["Clearance service fee", 70000]], 11);
  receipt(s113, { kind: "invoice", invoiceId: inv113.id }, 70000, 6, null);
  cost(s113, "Officer travel to Beitbridge", 18000, 16);

  const s114 = ship({
    n: "0114", clientId: "c-kap", description: "Fertiliser blending spares (ZAR-funded port charges)", category: "import", mode: "sea_road",
    origin: "Durban", destination: "Harare", borderPost: "Beitbridge", officerId: "u-chipo", stage: "released",
    createdDaysAgo: 13, extRef: "BB-SUB-47851 (demo)", eta: -1,
  });
  const fr114 = funding(s114, "Durban port and terminal charges", 1850000, 11, -9, "ZAR");
  fundAndVerify(s114, fr114, 1850000, 9);
  disburse(s114, "port_charges", "Terminal operator charges (demo)", 1850000, 8, null, "ZAR");
  const fr114b = funding(s114, "Customs duty", 160000, 7, -4);
  fundAndVerify(s114, fr114b, 160000, 5);
  disburse(s114, "duty", "Customs duty payment (demo)", 160000, 4);
  invoice(s114, [["Clearance service fee", 60000]], null);

  void ships;
  return d;
}
