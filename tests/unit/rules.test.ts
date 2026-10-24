import { describe, expect, it } from "vitest";
import { computeFinance } from "@/domain/finance";
import { checkUpload } from "@/domain/files";
import { computeReadiness, decideTransition, transitionBlockers, type TransitionContext } from "@/domain/rules";
import type { DocumentRequirement, Shipment, ShipmentDocument, Stage } from "@/domain/types";
import { makePdf } from "@/data/samplePdf";

const ship = (stage: Stage, extra: Partial<Shipment> = {}): Shipment => ({
  id: "S", reference: "R", clientId: "C", description: "d", category: "import", mode: "road", origin: "o", destination: "d",
  borderPost: "b", assignedOfficerId: "u-tendai", stage, externalReference: null, expectedArrival: null, expectedDelivery: null,
  clientReference: null, internalNotes: "", isGuidedDemo: false, version: 1, createdAt: "", updatedAt: "", ...extra,
});
const req = (id: string): DocumentRequirement => ({ id, shipmentId: "S", docType: "commercial_invoice", label: id, required: true, createdAt: "" });
const doc = (id: string, requirementId: string | null, status: ShipmentDocument["status"], uploadedAt = "2026-01-01", docType: ShipmentDocument["docType"] = "commercial_invoice"): ShipmentDocument => ({
  id, shipmentId: "S", clientId: "C", requirementId, docType, fileName: id, mimeType: "application/pdf", size: 1, blobId: id,
  uploadedById: "x", uploadedAt, status, reviewedById: null, reviewedAt: null, rejectionReason: null, clientVisible: true,
});
const ctx = (s: Shipment, over: Partial<TransitionContext> = {}): TransitionContext => ({
  shipment: s, requirements: [req("A"), req("B")], documents: [doc("a", "A", "accepted"), doc("b", "B", "accepted")],
  tasks: [], exceptions: [], notifications: [], invoices: [], finance: {}, ...over,
});

describe("document readiness", () => {
  it("counts missing, rejected, under review and accepted; history is preserved", () => {
    const reqs = [req("A"), req("B"), req("C"), req("D")];
    const docs = [
      doc("a1", "A", "rejected", "2026-01-01"),
      doc("a2", "A", "accepted", "2026-01-02"),
      doc("b1", "B", "rejected", "2026-01-01"),
      doc("c1", "C", "pending_review", "2026-01-01"),
    ];
    expect(computeReadiness(reqs, docs)).toEqual({ status: "incomplete", required: 4, accepted: 1, missing: 1, underReview: 1, rejected: 1 });
  });
  it("is complete only when every required document is accepted", () => {
    expect(computeReadiness([req("A")], [doc("a", "A", "accepted")]).status).toBe("complete");
    expect(computeReadiness([req("A")], [doc("a", "A", "pending_review")]).status).toBe("incomplete");
  });
});

describe("stage transitions", () => {
  it("only allows the next stage (no skipping, no going back)", () => {
    expect(transitionBlockers(ctx(ship("preparation")), { to: "submitted" })[0].code).toBe("invalid_transition");
    expect(transitionBlockers(ctx(ship("submitted")), { to: "preparation" })[0].code).toBe("invalid_transition");
  });
  it("missing or rejected documents block readiness (overridable by supervisor with reason)", () => {
    const c = ctx(ship("preparation"), { documents: [doc("a", "A", "accepted"), doc("b", "B", "rejected")] });
    const b = transitionBlockers(c, { to: "ready_for_submission" });
    expect(b.map((x) => [x.code, x.overridable])).toEqual([["documents_incomplete", true]]);
    expect(decideTransition(c, { to: "ready_for_submission" }, "operations_supervisor").allowed).toBe(false);
    expect(decideTransition(c, { to: "ready_for_submission", override: true }, "operations_supervisor").allowed).toBe(false); // no reason
    expect(decideTransition(c, { to: "ready_for_submission", override: true, reason: "Client couriering original" }, "officer").allowed).toBe(false);
    expect(decideTransition(c, { to: "ready_for_submission", override: true, reason: "Client couriering original" }, "operations_supervisor")).toEqual({
      allowed: true,
      overrideUsed: true,
    });
  });
  it("submission requires an officer and a submission reference (not overridable)", () => {
    const c = ctx(ship("ready_for_submission", { assignedOfficerId: null }));
    expect(transitionBlockers(c, { to: "submitted" }).map((x) => x.code).sort()).toEqual(["no_officer", "submission_reference"]);
    const ok = ctx(ship("ready_for_submission"));
    expect(transitionBlockers(ok, { to: "submitted", submissionReference: "REF-1" })).toEqual([]);
    expect(decideTransition(ok, { to: "submitted", override: true, reason: "x" }, "operations_supervisor").allowed).toBe(false);
  });
  it("release requires release evidence; delivery requires proof of delivery", () => {
    expect(transitionBlockers(ctx(ship("submitted")), { to: "released" })[0].code).toBe("release_evidence");
    expect(
      transitionBlockers(ctx(ship("submitted"), { documents: [doc("r", null, "accepted", "2026-01-01", "release_evidence")] }), { to: "released" }),
    ).toEqual([]);
    expect(transitionBlockers(ctx(ship("in_delivery")), { to: "delivered" })[0].code).toBe("proof_of_delivery");
  });
  it("closure requires resolved blocking tasks, issued invoice and financial reconciliation", () => {
    const fin = computeFinance({
      fundingRequests: [],
      notifications: [],
      receipts: [],
      disbursements: [{ id: "d", shipmentId: "S", clientId: "C", category: "duty", payee: "p", amount: 500, currency: "USD", paidOn: "", reference: "r", prefunded: true, prefundReason: "x", recordedById: "u", recordedAt: "" }],
      invoices: [],
      invoiceLines: [],
      costs: [],
    });
    const c = ctx(ship("delivered"), {
      tasks: [{ id: "t", shipmentId: "S", title: "t", assigneeId: "u", dueDate: "2026-01-01", status: "open", blocking: true, exceptionId: null, createdAt: "", completedAt: null }],
      finance: fin,
    });
    const codes = transitionBlockers(c, { to: "closed" }).map((b) => b.code);
    expect(codes).toEqual(["open_blocking_tasks", "invoice_not_issued", "unrecovered_disbursements"]);
    expect(decideTransition(c, { to: "closed", override: true, reason: "x" }, "operations_supervisor").allowed).toBe(false);
  });
  it("reopening requires a supervisor and a reason", () => {
    const c = ctx(ship("closed"));
    expect(decideTransition(c, { to: "delivered" }, "operations_supervisor").allowed).toBe(false);
    expect(decideTransition(c, { to: "delivered", reason: "Duty refund query" }, "officer").allowed).toBe(false);
    expect(decideTransition(c, { to: "delivered", reason: "Duty refund query" }, "operations_supervisor").allowed).toBe(true);
  });
  it("clients and management cannot move stages", () => {
    const c = ctx(ship("released"));
    expect(decideTransition(c, { to: "in_delivery" }, "client").allowed).toBe(false);
    expect(decideTransition(c, { to: "in_delivery" }, "management").allowed).toBe(false);
    expect(decideTransition(c, { to: "in_delivery" }, "officer").allowed).toBe(true);
  });
});

describe("upload safety", () => {
  const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  it("accepts a real PDF and text", () => {
    expect(checkUpload("a.pdf", makePdf("t", ["x"]))).toEqual({ ok: true, mimeType: "application/pdf" });
    expect(checkUpload("notes.TXT", enc("hello"))).toEqual({ ok: true, mimeType: "text/plain" });
  });
  it("rejects HTML, mismatched content, empty and oversized files", () => {
    expect(checkUpload("x.html", enc("<script>alert(1)</script>")).ok).toBe(false);
    expect(checkUpload("fake.pdf", enc("<html>not a pdf</html>"))).toEqual({ ok: false, error: "The file content does not match its .pdf extension." });
    expect(checkUpload("e.pdf", new ArrayBuffer(0))).toEqual({ ok: false, error: "The file is empty." });
    expect(checkUpload("big.txt", new ArrayBuffer(5 * 1024 * 1024 + 1)).ok).toBe(false);
  });
});
