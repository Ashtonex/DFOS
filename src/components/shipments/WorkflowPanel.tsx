"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, RotateCcw, ShieldAlert } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { STAGE_LABEL } from "@/domain/labels";
import { OVERRIDE_ROLES, REOPEN_ROLES } from "@/domain/rules";
import type { Stage } from "@/domain/types";
import type { ShipmentDetail } from "@/data/repository";
import { useDfosMutation, useOpId, useViewer } from "@/lib/hooks";
import { canWrite } from "@/lib/persona";
import { TOPICS } from "@/lib/queryKeys";
import { useToast } from "../toast";
import { Alert, Button, Card, CardHeader, SelectField, TextAreaField, TextField } from "../ui";

const BLOCKER_TAB: Record<string, string> = {
  documents_incomplete: "documents",
  release_evidence: "documents",
  proof_of_delivery: "documents",
  open_blocking_tasks: "tasks",
  open_exceptions: "tasks",
  unverified_notifications: "finance",
  invoice_not_issued: "finance",
  unrecovered_disbursements: "finance",
  client_funds_held: "finance",
  invoice_outstanding: "finance",
};

export function WorkflowPanel({ d }: { d: ShipmentDetail }) {
  const { persona } = useViewer();
  const pathname = usePathname();
  const toast = useToast();
  const s = d.shipment;
  const writable = canWrite(persona);
  const role = d.users.find((u) => u.id === persona?.userId)?.role;
  const canOverride = !!role && OVERRIDE_ROLES.includes(role);
  const [subRef, setSubRef] = useState("");
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opId, renewOpId] = useOpId();

  const move = useDfosMutation({
    mutationFn: (p, v: { to: Stage; submissionReference?: string; reason?: string; override?: boolean }) =>
      repo.transitionStage(p.userId, s.id, v, opId),
    topics: TOPICS.workflow,
    shipmentId: () => s.id,
  });

  const next = d.next;
  const blockers = next?.blockers ?? [];
  const needsRef = next?.stage === "submitted" && !s.externalReference;
  const effective = blockers.filter((b) => !(b.code === "submission_reference" && subRef.trim()));
  const hard = effective.filter((b) => !b.overridable);
  const soft = effective.filter((b) => b.overridable);
  const canAdvance = writable && next && hard.length === 0 && (soft.length === 0 || (override && canOverride && reason.trim()));

  const run = async (to: Stage, extra: { submissionReference?: string; reason?: string; override?: boolean } = {}) => {
    setError(null);
    try {
      await move.mutateAsync({ to, ...extra });
      renewOpId();
      setSubRef("");
      setReason("");
      setOverride(false);
      toast("success", `Moved to ${STAGE_LABEL[to]}.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (s.stage === "closed")
    return (
      <Card>
        <CardHeader title="File closed" description="Closed after the closure criteria were met." />
        <div className="space-y-3 p-4">
          {writable && role && REOPEN_ROLES.includes(role) ? (
            <>
              <TextAreaField label="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} />
              {error && <Alert tone="danger">{error}</Alert>}
              <Button variant="secondary" pending={move.isPending} disabled={!reason.trim()} onClick={() => run("delivered", { reason })} data-testid="reopen">
                <RotateCcw className="size-4" aria-hidden /> Reopen file
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-600">Only an operations supervisor can reopen a closed file.</p>
          )}
        </div>
      </Card>
    );

  return (
    <Card data-testid="workflow-panel">
      <CardHeader title="Next step" description={next ? `Current: ${STAGE_LABEL[s.stage]} → next: ${STAGE_LABEL[next.stage as Stage]}` : undefined} />
      <div className="space-y-3 p-4">
        {!next ? null : effective.length === 0 ? (
          <Alert tone="success">All requirements for {STAGE_LABEL[next.stage as Stage]} are met.</Alert>
        ) : (
          <ul className="space-y-1.5" data-testid="blockers">
            {effective.map((b) => (
              <li key={b.code + b.message} className="flex items-start gap-2 text-sm">
                <ShieldAlert className={`mt-0.5 size-4 shrink-0 ${b.overridable ? "text-amber-600" : "text-red-600"}`} aria-hidden />
                <span>
                  {b.message}
                  {b.overridable && <span className="text-xs text-amber-800"> (supervisor may override)</span>}{" "}
                  {BLOCKER_TAB[b.code] && (
                    <Link className="text-xs text-navy-700 underline" href={`${pathname}?tab=${BLOCKER_TAB[b.code]}`} scroll={false}>
                      Resolve
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {writable && next && (
          <>
            {needsRef && (
              <TextField
                label="Customs submission reference (manually recorded)"
                value={subRef}
                onChange={(e) => setSubRef(e.target.value)}
                placeholder="e.g. BB-SUB-49001"
                data-testid="submission-ref"
              />
            )}
            {soft.length > 0 && hard.length === 0 && canOverride && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-amber-950">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} data-testid="override-toggle" />
                  Override as operations supervisor
                </label>
                {override && <TextAreaField label="Override reason (recorded in the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="override-reason" />}
              </div>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <Button
              pending={move.isPending}
              disabled={!canAdvance}
              data-testid="advance-stage"
              onClick={() =>
                run(next.stage as Stage, {
                  submissionReference: needsRef ? subRef.trim() : undefined,
                  override: soft.length > 0 ? override : undefined,
                  reason: soft.length > 0 && override ? reason : undefined,
                })
              }
            >
              Move to {STAGE_LABEL[next.stage as Stage]} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </>
        )}
        {!writable && <p className="text-xs text-slate-500">Read-only view. Stage changes are made by Operations.</p>}
      </div>
    </Card>
  );
}

export function AssignmentCard({ d }: { d: ShipmentDetail }) {
  const { persona } = useViewer();
  const toast = useToast();
  const officers = d.users.filter((u) => u.role === "officer" || u.role === "operations_supervisor");
  const [officerId, setOfficerId] = useState(d.shipment.assignedOfficerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const assign = useDfosMutation({
    mutationFn: (p, id: string) => repo.assignOfficer(p.userId, d.shipment.id, id),
    topics: TOPICS.shipmentRecord,
    shipmentId: () => d.shipment.id,
  });
  const writable = canWrite(persona) && d.shipment.stage !== "closed";
  return (
    <Card>
      <CardHeader title="Assigned officer" />
      <div className="space-y-2 p-4">
        {writable ? (
          <>
            <SelectField
              label="Clearance officer"
              value={officerId}
              onChange={(e) => {
                setOfficerId(e.target.value);
                setError(null);
              }}
              options={[{ value: "", label: "— Unassigned —" }, ...officers.map((o) => ({ value: o.id, label: `${o.name} (${o.title})` }))]}
              data-testid="officer-select"
              error={error ?? undefined}
            />
            <Button
              size="sm"
              variant="secondary"
              pending={assign.isPending}
              disabled={!officerId || officerId === d.shipment.assignedOfficerId}
              data-testid="assign-officer"
              onClick={async () => {
                try {
                  await assign.mutateAsync(officerId);
                  toast("success", "Officer assigned.");
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Assign
            </Button>
          </>
        ) : (
          <p className="text-sm">{d.officer?.name ?? "Unassigned"}</p>
        )}
      </div>
    </Card>
  );
}
