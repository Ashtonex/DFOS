// Repository integration tests on an ISOLATED fake IndexedDB database
// (never the presenter's `dfos-demo`).
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, configureDb, seedInfo } from "@/data/db";
import * as repo from "@/data/repository";
import { DomainError, NotFoundError } from "@/data/errors";
import { makePdf } from "@/data/samplePdf";
import { computeReadiness, todayISO } from "@/domain/rules";
import type { Viewer } from "@/domain/types";

const OPS = "u-rudo";
const OFFICER = "u-tendai";
const MGMT = "u-tafadzwa";
const EHIS: Viewer = { kind: "client", userId: "u-grace", clientId: "c-ehis" };
const KAP: Viewer = { kind: "client", userId: "u-peter", clientId: "c-kap" };
const STAFF: Viewer = { kind: "staff", userId: OPS };
const pdf = () => makePdf("test", ["test document"]);
let n = 0;
const op = () => `op-${++n}-${Math.random()}`;

async function freshDb() {
  await closeDb();
  configureDb({ name: `dfos-test-${Date.now()}-${Math.random()}` });
}

beforeEach(freshDb);

const editInput = (s: Awaited<ReturnType<typeof repo.getShipmentDetail>>) => {
  const x = s!.shipment;
  return {
    description: x.description, mode: x.mode, origin: x.origin, destination: x.destination, borderPost: x.borderPost,
    expectedArrival: x.expectedArrival ?? "", expectedDelivery: x.expectedDelivery ?? "", clientReference: x.clientReference ?? "",
    externalReference: x.externalReference ?? "", internalNotes: x.internalNotes,
  };
};

describe("persistence", () => {
  it("seeds once, then a saved edit survives closing and reopening without reseeding", async () => {
    const before = await repo.getWorkspace(STAFF);
    expect(before.rows).toHaveLength(14);
    const seeded = await seedInfo();
    const d = await repo.getShipmentDetail(STAFF, "shp-0101");
    await repo.updateShipment(OPS, "shp-0101", d!.shipment.version, { ...editInput(d), description: "Persisted description" });

    const name = (await import("@/data/db")).currentDbName();
    await closeDb(); // drop the connection entirely
    configureDb({ name }); // reopen the same database
    const after = await repo.getShipmentDetail(STAFF, "shp-0101");
    expect(after!.shipment.description).toBe("Persisted description");
    expect(after!.shipment.version).toBe(d!.shipment.version + 1);
    expect(await seedInfo()).toEqual(seeded); // not reseeded
    expect((await repo.getWorkspace(STAFF)).rows).toHaveLength(14); // no duplicates
  });

  it("rejects stale edits (optimistic concurrency) instead of overwriting", async () => {
    const d = await repo.getShipmentDetail(STAFF, "shp-0103");
    await repo.updateShipment(OPS, "shp-0103", d!.shipment.version, { ...editInput(d), description: "First" });
    await expect(repo.updateShipment(OPS, "shp-0103", d!.shipment.version, { ...editInput(d), description: "Stale" })).rejects.toMatchObject({ code: "conflict" });
    expect((await repo.getShipmentDetail(STAFF, "shp-0103"))!.shipment.description).toBe("First");
  });

  it("stores document bytes and reads them back after reopen", async () => {
    const d = await repo.getShipmentDetail(STAFF, "shp-0101");
    const transport = d!.requirements.find((r) => r.requirement.docType === "transport_document")!;
    const bytes = new TextEncoder().encode("Road manifest RM-77 (test)").buffer as ArrayBuffer;
    const { documentId } = await repo.uploadDocument("u-grace", { shipmentId: "shp-0101", requirementId: transport.requirement.id, docType: "transport_document", fileName: "manifest.txt", data: bytes }, op());
    const name = (await import("@/data/db")).currentDbName();
    await closeDb();
    configureDb({ name });
    const file = await repo.getDocumentFile(EHIS, documentId);
    expect(new TextDecoder().decode(file.data)).toBe("Road manifest RM-77 (test)");
    expect(file.mimeType).toBe("text/plain");
  });
});

describe("reset", () => {
  it("restores every entity consistently and removes demo-created records", async () => {
    const initial = await repo.getScopedSnapshot(STAFF);
    await repo.createShipmentRequest("u-grace", { description: "x", category: "import", mode: "road", origin: "a", destination: "b", borderPost: "c", expectedArrival: "", clientReference: "", guidedDemo: true }, op());
    expect((await repo.getWorkspace(STAFF)).rows).toHaveLength(15);
    await repo.resetDemoData();
    const snap = await repo.getScopedSnapshot(STAFF);
    for (const k of Object.keys(initial) as (keyof typeof initial)[]) expect(snap[k].length, k).toBe(initial[k].length);
    expect(snap.shipments.some((s) => s.reference === "DF-DEMO-2026-001")).toBe(false);
    // referential integrity: every child row points to an existing shipment, every document has its bytes
    const ids = new Set(snap.shipments.map((s) => s.id));
    for (const k of ["milestones", "requirements", "documents", "tasks", "exceptions", "fundingRequests", "notifications", "receipts", "disbursements", "invoices", "costs"] as const)
      for (const row of snap[k] as { shipmentId: string }[]) expect(ids.has(row.shipmentId), `${k} orphan`).toBe(true);
    for (const doc of snap.documents) await expect(repo.getDocumentFile(STAFF, doc.id)).resolves.toBeTruthy();
  });
});

describe("client scoping", () => {
  it("lists only the client's own shipments and strips internal content", async () => {
    const ws = await repo.getWorkspace(EHIS);
    expect(ws.rows.length).toBeGreaterThan(0);
    expect(ws.rows.every((r) => r.shipment.clientId === "c-ehis")).toBe(true);
    expect(ws.snapshot.clients.map((c) => c.id)).toEqual(["c-ehis"]);
    expect(ws.snapshot.shipments.every((s) => s.internalNotes === "")).toBe(true);
    expect(ws.snapshot.tasks).toEqual([]);
    expect(ws.snapshot.exceptions).toEqual([]);
    expect(ws.snapshot.costs).toEqual([]);
    expect(ws.snapshot.invoices.every((i) => i.status === "issued")).toBe(true);
    expect(ws.snapshot.activity.every((a) => a.clientSummary !== null && a.summary === a.clientSummary)).toBe(true);
    expect(ws.snapshot.disbursements.every((d) => d.prefundReason === null)).toBe(true);
  });

  it("returns nothing for another client's detail route, search, or document", async () => {
    expect(await repo.getShipmentDetail(KAP, "shp-0101")).toBeNull(); // EHIS file
    expect(await repo.getShipmentDetail(EHIS, "shp-0101")).not.toBeNull();
    expect(await repo.search(KAP, "DF-2026-0101")).toEqual([]);
    expect((await repo.search(EHIS, "DF-2026-0101")).length).toBeGreaterThan(0);
    const ehisDoc = (await repo.getScopedSnapshot(EHIS)).documents[0];
    await expect(repo.getDocumentFile(KAP, ehisDoc.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.getDocumentFile(EHIS, ehisDoc.id)).resolves.toBeTruthy();
  });

  it("blocks client mutations on other clients' records", async () => {
    const reqId = (await repo.getShipmentDetail(STAFF, "shp-0101"))!.requirements.find((r) => r.state === "missing")!.requirement.id;
    await expect(
      repo.uploadDocument("u-peter", { shipmentId: "shp-0101", requirementId: reqId, docType: "transport_document", fileName: "x.pdf", data: pdf() }, op()),
    ).rejects.toBeInstanceOf(NotFoundError);
    const fr = (await repo.getScopedSnapshot(STAFF)).fundingRequests.find((f) => f.clientId === "c-ehis")!;
    await expect(
      repo.notifyPayment("u-peter", { target: { kind: "funding_request", fundingRequestId: fr.id }, amount: 100, payerReference: "x", paidOn: todayISO() }, op()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("management persona is read-only", async () => {
    const d = await repo.getShipmentDetail(STAFF, "shp-0101");
    await expect(repo.updateShipment(MGMT, "shp-0101", d!.shipment.version, editInput(d))).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("duplicate-submission protection", () => {
  it("concurrent submissions with the same idempotency key create one record", async () => {
    const key = op();
    const input = { description: "Dup test", category: "export" as const, mode: "road" as const, origin: "a", destination: "b", borderPost: "c", expectedArrival: "", clientReference: "", guidedDemo: false };
    const [a, b] = await Promise.all([repo.createShipmentRequest("u-grace", input, key), repo.createShipmentRequest("u-grace", input, key)]);
    expect(a).toEqual(b);
    expect((await repo.getWorkspace(STAFF)).rows.filter((r) => r.shipment.description === "Dup test")).toHaveLength(1);
  });

  it("a payment notification can be verified only once and bank references are unique", async () => {
    const pending = (await repo.getScopedSnapshot(STAFF)).notifications.find((x) => x.status === "notified")!;
    await repo.verifyPayment(OPS, pending.id, { amountReceived: pending.amount, bankReference: "BNK-UNIQUE-1", receivedOn: todayISO() }, op());
    await expect(repo.verifyPayment(OPS, pending.id, { amountReceived: pending.amount, bankReference: "BNK-UNIQUE-2", receivedOn: todayISO() }, op())).rejects.toMatchObject({ code: "already_resolved" });
    const receipts = (await repo.getScopedSnapshot(STAFF)).receipts.filter((r) => r.notificationId === pending.id);
    expect(receipts).toHaveLength(1);
  });

  it("the guided demo shipment can only exist once", async () => {
    const input = { description: "Machinery spare parts", category: "import" as const, mode: "road" as const, origin: "Durban", destination: "Mutare", borderPost: "Beitbridge", expectedArrival: "", clientReference: "", guidedDemo: true };
    await repo.createShipmentRequest("u-grace", input, op());
    await expect(repo.createShipmentRequest("u-grace", input, op())).rejects.toMatchObject({ code: "demo_exists" });
  });
});

describe("atomicity", () => {
  it("a failure after writes inside a mutation leaves no partial business state", async () => {
    const before = await repo.getScopedSnapshot(STAFF);
    await expect(
      repo.runAtomicForTests(undefined, async (tx) => {
        await tx.objectStore("activity").put({ id: "act-partial", shipmentId: "shp-0101", clientId: "c-ehis", at: "", actorId: OPS, type: "x", summary: "partial", clientSummary: null });
        await tx.objectStore("tasks").put({ id: "task-partial", shipmentId: "shp-0101", title: "partial", assigneeId: OPS, dueDate: "2026-01-01", status: "open", blocking: true, exceptionId: null, createdAt: "", completedAt: null });
        throw new DomainError("boom", "simulated failure after writes");
      }),
    ).rejects.toThrow("simulated failure after writes");
    const after = await repo.getScopedSnapshot(STAFF);
    expect(after.activity.length).toBe(before.activity.length);
    expect(after.tasks.length).toBe(before.tasks.length);
  });

  it("a blocked transition changes nothing", async () => {
    const before = await repo.getShipmentDetail(STAFF, "shp-0101");
    await expect(repo.transitionStage(OPS, "shp-0101", { to: "ready_for_submission" }, op())).rejects.toMatchObject({ code: "transition_blocked" });
    const after = await repo.getShipmentDetail(STAFF, "shp-0101");
    expect(after!.shipment.version).toBe(before!.shipment.version);
    expect(after!.milestones).toHaveLength(before!.milestones.length);
  });
});

describe("money controls", () => {
  it("a client notification never becomes available funds until verified", async () => {
    const d = await repo.getShipmentDetail(STAFF, "shp-0103"); // funding requested, nothing paid
    const fr = d!.fundingRequests[0].request;
    await repo.notifyPayment("u-peter", { target: { kind: "funding_request", fundingRequestId: fr.id }, amount: fr.amount, payerReference: "KAP-EFT-1", paidOn: todayISO() }, op());
    const after = await repo.getShipmentDetail(STAFF, "shp-0103");
    expect(after!.row.finance.USD!.notifiedUnverified).toBe(fr.amount);
    expect(after!.row.finance.USD!.verifiedClientFunds).toBe(0);
    await expect(
      repo.recordDisbursement(OPS, { shipmentId: "shp-0103", category: "duty", payee: "Customs", amount: 1000, currency: "USD", paidOn: todayISO(), reference: "P1" }, op()),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("blocks disbursements beyond funds unless a supervisor pre-funds with a reason; refunds cannot exceed funds", async () => {
    const input = { shipmentId: "shp-0103", category: "duty" as const, payee: "Customs", amount: 5000, currency: "USD" as const, paidOn: todayISO(), reference: "P2" };
    await expect(repo.recordDisbursement(OFFICER, { ...input, prefundReason: "urgent" }, op())).rejects.toMatchObject({ code: "forbidden" });
    const res = await repo.recordDisbursement(OPS, { ...input, prefundReason: "Avoid storage charges" }, op());
    expect(res.prefunded).toBe(true);
    const d = await repo.getShipmentDetail(STAFF, "shp-0103");
    expect(d!.row.finance.USD!.unrecoveredDisbursements).toBe(5000);
    await expect(repo.recordDisbursement(OPS, { ...input, category: "client_refund", prefundReason: "x" }, op())).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects zero, negative and non-integer amounts", async () => {
    for (const amount of [0, -100, 10.5, Number.NaN])
      await expect(
        repo.createFundingRequest(OPS, { shipmentId: "shp-0103", purpose: "x", amount, currency: "USD", dueDate: todayISO() }, op()),
      ).rejects.toMatchObject({ code: "validation" });
  });

  it("ZAR funds cannot pay a USD disbursement", async () => {
    // shp-0114 holds 0 ZAR and 0 USD after seed disbursements; add ZAR funds only
    const fr = await repo.createFundingRequest(OPS, { shipmentId: "shp-0114", purpose: "ZAR top-up", amount: 100000, currency: "ZAR", dueDate: todayISO() }, op());
    const { notificationId } = await repo.notifyPayment("u-peter", { target: { kind: "funding_request", fundingRequestId: fr.fundingRequestId }, amount: 100000, payerReference: "Z", paidOn: todayISO() }, op());
    await repo.verifyPayment(OPS, notificationId, { amountReceived: 100000, bankReference: "ZAR-BNK-1", receivedOn: todayISO() }, op());
    await expect(
      repo.recordDisbursement(OPS, { shipmentId: "shp-0114", category: "duty", payee: "Customs", amount: 100, currency: "USD", paidOn: todayISO(), reference: "U1" }, op()),
    ).rejects.toMatchObject({ code: "validation" });
    await repo.recordDisbursement(OPS, { shipmentId: "shp-0114", category: "port_charges", payee: "Terminal", amount: 100000, currency: "ZAR", paidOn: todayISO(), reference: "Z1" }, op());
  });

  it("receipt reversal is excluded from totals and audited", async () => {
    const r = (await repo.getScopedSnapshot(STAFF)).receipts.find((x) => x.shipmentId === "shp-0104")!;
    const before = (await repo.getShipmentDetail(STAFF, "shp-0104"))!.row.finance.USD!;
    await repo.reverseReceipt(OPS, r.id, "Payment recalled by bank");
    const after = await repo.getShipmentDetail(STAFF, "shp-0104");
    expect(after!.row.finance.USD!.verifiedClientFunds).toBe(before.verifiedClientFunds - r.amount);
    expect(after!.activity[0].type).toBe("receipt.reversed");
    await expect(repo.reverseReceipt(OPS, r.id, "again")).rejects.toMatchObject({ code: "already_reversed" });
  });
});

describe("guided scenario end-to-end through the repository", () => {
  it("runs DF-DEMO-2026-001 from client request to closure, enforcing every rule", async () => {
    // 1. client submits request
    const { shipmentId, reference } = await repo.createShipmentRequest(
      "u-grace",
      { description: "Machinery spare parts", category: "import", mode: "road", origin: "Durban", destination: "Mutare", borderPost: "Beitbridge", expectedArrival: "", clientReference: "EH-PO-8120", guidedDemo: true },
      op(),
    );
    expect(reference).toBe("DF-DEMO-2026-001");
    // 2. visible in Operations, not to another client
    expect((await repo.getWorkspace(STAFF)).rows.some((r) => r.shipment.id === shipmentId)).toBe(true);
    expect(await repo.getShipmentDetail(KAP, shipmentId)).toBeNull();
    // 3. preparation requires an officer
    await expect(repo.transitionStage(OPS, shipmentId, { to: "preparation" }, op())).rejects.toMatchObject({ code: "transition_blocked" });
    await repo.assignOfficer(OPS, shipmentId, OFFICER);
    await repo.transitionStage(OPS, shipmentId, { to: "preparation" }, op());
    // 4. outstanding documents identified; client uploads; one rejected then resubmitted
    let d = await repo.getShipmentDetail(EHIS, shipmentId);
    expect(d!.requirements.every((r) => r.state === "missing")).toBe(true);
    const ids: Record<string, string> = {};
    for (const v of d!.requirements) {
      const r = await repo.uploadDocument("u-grace", { shipmentId, requirementId: v.requirement.id, docType: v.requirement.docType, fileName: `${v.requirement.docType}.pdf`, data: pdf() }, op());
      ids[v.requirement.docType] = r.documentId;
    }
    await repo.reviewDocument(OFFICER, ids.certificate_of_origin, "reject", "Unsigned certificate");
    await expect(repo.reviewDocument(OFFICER, ids.certificate_of_origin, "accept")).rejects.toMatchObject({ code: "already_reviewed" });
    for (const [type, id] of Object.entries(ids)) if (type !== "certificate_of_origin") await repo.reviewDocument(OFFICER, id, "accept");
    await expect(repo.transitionStage(OFFICER, shipmentId, { to: "ready_for_submission" }, op())).rejects.toMatchObject({ code: "transition_blocked" });
    const coo = (await repo.getShipmentDetail(EHIS, shipmentId))!.requirements.find((r) => r.requirement.docType === "certificate_of_origin")!;
    expect(coo.state).toBe("rejected");
    const re = await repo.uploadDocument("u-grace", { shipmentId, requirementId: coo.requirement.id, docType: "certificate_of_origin", fileName: "coo-signed.pdf", data: pdf() }, op());
    await repo.reviewDocument(OFFICER, re.documentId, "accept");
    d = await repo.getShipmentDetail(STAFF, shipmentId);
    expect(computeReadiness(d!.requirements.map((r) => r.requirement), d!.documents).status).toBe("complete");
    expect(d!.requirements.find((r) => r.requirement.docType === "certificate_of_origin")!.history).toHaveLength(2); // history kept
    await repo.transitionStage(OFFICER, shipmentId, { to: "ready_for_submission" }, op());
    // 5. submission requires a reference
    await expect(repo.transitionStage(OFFICER, shipmentId, { to: "submitted" }, op())).rejects.toMatchObject({ code: "transition_blocked" });
    await repo.transitionStage(OFFICER, shipmentId, { to: "submitted", submissionReference: "BB-SUB-DEMO-001" }, op());
    // 6. external delay -> exception + follow-up task
    const exc = await repo.recordException(OFFICER, { shipmentId, category: "external_delay", authority: "Customs processing — Beitbridge", description: "Held for inspection", ownerId: OFFICER, nextAction: "Confirm inspection slot", followUpDate: todayISO() }, op());
    await expect(repo.completeTask(OFFICER, exc.taskId)).rejects.toMatchObject({ code: "exception_open" });
    // 7. funding request -> client notification -> verification
    const fr = await repo.createFundingRequest(OPS, { shipmentId, purpose: "Customs duty and VAT", amount: 250000, currency: "USD", dueDate: todayISO() }, op());
    const nt = await repo.notifyPayment("u-grace", { target: { kind: "funding_request", fundingRequestId: fr.fundingRequestId }, amount: 250000, payerReference: "EHIS-EFT-9001", paidOn: todayISO() }, op());
    await repo.verifyPayment(OPS, nt.notificationId, { amountReceived: 250000, bankReference: "BNK-DEMO-001", receivedOn: todayISO() }, op());
    // 8. disbursement
    await repo.recordDisbursement(OPS, { shipmentId, category: "duty", payee: "Customs duty (demo)", amount: 250000, currency: "USD", paidOn: todayISO(), reference: "PAY-DEMO-1" }, op());
    // 9. release evidence
    await expect(repo.transitionStage(OFFICER, shipmentId, { to: "released" }, op())).rejects.toMatchObject({ code: "transition_blocked" });
    await repo.uploadDocument(OFFICER, { shipmentId, requirementId: null, docType: "release_evidence", fileName: "release.pdf", data: pdf() }, op());
    await repo.transitionStage(OFFICER, shipmentId, { to: "released" }, op());
    await repo.transitionStage(OFFICER, shipmentId, { to: "in_delivery" }, op());
    await repo.uploadDocument(OFFICER, { shipmentId, requirementId: null, docType: "proof_of_delivery", fileName: "pod.pdf", data: pdf() }, op());
    await repo.transitionStage(OFFICER, shipmentId, { to: "delivered" }, op());
    // 10. closure blocked until exception resolved and invoice issued + paid
    await expect(repo.transitionStage(OPS, shipmentId, { to: "closed" }, op())).rejects.toThrow(/exception|invoice/);
    await repo.resolveException(OFFICER, exc.exceptionId, "Inspection completed (manually recorded)");
    const line = await repo.addInvoiceLine(OPS, { shipmentId, description: "Clearance service fee", amount: 75000, currency: "USD" }, op());
    await repo.issueInvoice(OPS, line.invoiceId);
    await expect(repo.transitionStage(OPS, shipmentId, { to: "closed" }, op())).rejects.toThrow(/Service invoice balance/);
    const inv = await repo.notifyPayment("u-grace", { target: { kind: "invoice", invoiceId: line.invoiceId }, amount: 75000, payerReference: "EHIS-EFT-9002", paidOn: todayISO() }, op());
    await repo.verifyPayment(OPS, inv.notificationId, { amountReceived: 75000, bankReference: "BNK-DEMO-002", receivedOn: todayISO() }, op());
    await repo.transitionStage(OPS, shipmentId, { to: "closed" }, op());
    d = await repo.getShipmentDetail(STAFF, shipmentId);
    expect(d!.shipment.stage).toBe("closed");
    const usd = d!.row.finance.USD!;
    expect([usd.verifiedClientFunds, usd.disbursed, usd.clientFundsHeld, usd.unrecoveredDisbursements, usd.invoiceOutstanding]).toEqual([250000, 250000, 0, 0, 0]);
    // client sees progress but not internal exception detail
    const cv = await repo.getShipmentDetail(EHIS, shipmentId);
    expect(cv!.exceptions).toEqual([]);
    expect(cv!.activity.some((a) => a.summary.includes("External processing delay recorded"))).toBe(true);
    expect(cv!.activity.some((a) => a.summary.includes("Held for inspection"))).toBe(false);
  });
});
