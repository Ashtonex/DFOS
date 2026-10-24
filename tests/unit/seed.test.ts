import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { buildRows, financeRecordsFor, kpiCounts, kpiRows, SHIPMENT_KPIS, type KpiKey, type Snapshot } from "@/domain/derive";
import { computeFinance } from "@/domain/finance";
import { closureBlockers, computeReadiness, hasAcceptedEvidence, stageIndex, todayISO } from "@/domain/rules";

const NOW = new Date("2026-10-24T10:00:00Z");
const seed = buildSeed(NOW);
const snap = seed as unknown as Snapshot;

describe("seed data", () => {
  it("is deterministic for a given seed moment (no random values)", () => {
    const again = buildSeed(NOW);
    expect(JSON.stringify(again.shipments)).toBe(JSON.stringify(seed.shipments));
    expect(JSON.stringify(again.activity)).toBe(JSON.stringify(seed.activity));
  });

  it("has the required variation", () => {
    expect(seed.clients.length).toBeGreaterThanOrEqual(3);
    expect(seed.shipments.length).toBeGreaterThanOrEqual(12);
    expect(seed.users.filter((u) => u.role === "officer").length).toBeGreaterThanOrEqual(3);
    const rows = buildRows(snap, todayISO(NOW));
    const c = kpiCounts(rows);
    expect(c.awaiting_documents).toBeGreaterThan(0);
    expect(seed.documents.some((d) => d.status === "rejected")).toBe(true);
    expect(c.external_delays).toBeGreaterThan(0);
    expect(c.overdue_followups).toBeGreaterThan(0);
    expect(c.awaiting_funds).toBeGreaterThan(0);
    expect(c.ready_to_close).toBeGreaterThan(0);
    expect(c.closed).toBeGreaterThan(0);
    expect(c.unrecovered).toBeGreaterThan(0);
    const margins = rows.map((r) => r.finance.USD?.marginBp).filter((m) => m !== null && m !== undefined) as number[];
    expect(new Set(margins.map((m) => Math.sign(m - 5000))).size).toBeGreaterThan(1); // different financial outcomes
  });

  it("satisfies its own workflow invariants", () => {
    for (const s of seed.shipments) {
      const reqs = seed.requirements.filter((r) => r.shipmentId === s.id);
      const docs = seed.documents.filter((d) => d.shipmentId === s.id);
      const i = stageIndex(s.stage);
      if (i >= stageIndex("preparation")) expect(s.assignedOfficerId, s.reference).not.toBeNull();
      if (i >= stageIndex("ready_for_submission")) expect(computeReadiness(reqs, docs).status, s.reference).toBe("complete");
      if (i >= stageIndex("submitted")) expect(s.externalReference, s.reference).toBeTruthy();
      if (i >= stageIndex("released")) expect(hasAcceptedEvidence(docs, "release_evidence"), s.reference).toBe(true);
      if (i >= stageIndex("delivered")) expect(hasAcceptedEvidence(docs, "proof_of_delivery"), s.reference).toBe(true);
      if (s.stage === "closed") {
        const fin = financeRecordsFor(snap, s.id);
        const blockers = closureBlockers({
          shipment: s,
          requirements: reqs,
          documents: docs,
          tasks: seed.tasks.filter((t) => t.shipmentId === s.id),
          exceptions: seed.exceptions.filter((e) => e.shipmentId === s.id),
          notifications: fin.notifications,
          invoices: fin.invoices,
          finance: computeFinance(fin),
        });
        expect(blockers, s.reference).toEqual([]);
      }
      // every document has bytes; every milestone sequence is in stage order
      for (const d of docs) expect(seed.blobs.some((b) => b.id === d.blobId)).toBe(true);
      const ms = seed.milestones.filter((m) => m.shipmentId === s.id).map((m) => stageIndex(m.stage));
      expect(ms).toEqual([...ms].sort((a, b) => a - b));
    }
    // verified notifications each have exactly one receipt
    for (const n of seed.notifications.filter((x) => x.status === "verified"))
      expect(seed.receipts.filter((r) => r.notificationId === n.id)).toHaveLength(1);
  });

  it("never disburses beyond verified funds unless the disbursement is flagged as pre-funded", () => {
    for (const s of seed.shipments) {
      const events = [
        ...seed.receipts.filter((r) => r.shipmentId === s.id && r.allocation.kind === "client_funds").map((r) => ({ at: r.verifiedAt, cur: r.currency, delta: r.amount, d: null })),
        ...seed.disbursements.filter((d) => d.shipmentId === s.id).map((d) => ({ at: d.recordedAt, cur: d.currency, delta: -d.amount, d })),
      ].sort((a, b) => a.at.localeCompare(b.at));
      const held: Record<string, number> = {};
      for (const e of events) {
        const before = held[e.cur] ?? 0;
        if (e.d && !e.d.prefunded) expect(e.d.amount, `${s.reference} ${e.d.payee}`).toBeLessThanOrEqual(before);
        held[e.cur] = before + e.delta;
      }
    }
  });

  it("every KPI drill-down returns exactly the counted records", () => {
    const rows = buildRows(snap, todayISO(NOW));
    const counts = kpiCounts(rows);
    for (const k of Object.keys(SHIPMENT_KPIS) as KpiKey[]) expect(kpiRows(rows, k).length, k).toBe(counts[k]);
  });
});
