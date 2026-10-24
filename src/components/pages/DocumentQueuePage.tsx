"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, FileText, X } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { DOC_TYPE_LABEL } from "@/domain/labels";
import { requirementViews } from "@/domain/rules";
import type { ShipmentDocument } from "@/domain/types";
import { useDfosMutation, useViewer, useWorkspace } from "@/lib/hooks";
import { canWrite } from "@/lib/persona";
import { shipmentHref } from "@/lib/links";
import { TOPICS } from "@/lib/queryKeys";
import { DocumentViewer } from "../documents/DocumentViewer";
import { RejectModal } from "../documents/DocumentsPanel";
import { ReadinessBadge, RequirementBadge } from "../status";
import { useToast } from "../toast";
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, TableWrap, formatDateTime, td, th } from "../ui";

export function DocumentQueuePage() {
  const { persona } = useViewer();
  const { data, error, isPending, refetch } = useWorkspace();
  const toast = useToast();
  const [viewing, setViewing] = useState<ShipmentDocument | null>(null);
  const [rejecting, setRejecting] = useState<ShipmentDocument | null>(null);
  const accept = useDfosMutation({
    mutationFn: (p, doc: ShipmentDocument) => repo.reviewDocument(p.userId, doc.id, "accept"),
    topics: TOPICS.documents,
    shipmentId: (doc) => doc.shipmentId,
  });
  if (isPending) return <LoadingBlock rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const writable = canWrite(persona);
  const ship = new Map(s.shipments.map((x) => [x.id, x]));
  const clientName = new Map(s.clients.map((c) => [c.id, c.shortName]));
  const reqLabel = new Map(s.requirements.map((r) => [r.id, r.label]));
  // Proof of payment is reviewed with its payment notification (Funding & finance), not here.
  const pending = s.documents.filter((d) => d.status === "pending_review" && d.docType !== "proof_of_payment").sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const incomplete = data.rows
    .filter((r) => r.shipment.stage !== "closed" && r.readiness.status === "incomplete")
    .sort((a, b) => a.shipment.reference.localeCompare(b.shipment.reference));
  const views = requirementViews(s.requirements, s.documents);

  return (
    <div className="space-y-4">
      <PageHeader title="Document readiness queue" subtitle="Review uploads, and chase files whose required documents are missing or rejected." />
      <Card>
        <CardHeader title={`Awaiting review (${pending.length})`} description="Oldest first." />
        {pending.length === 0 ? (
          <EmptyState title="No documents awaiting review." />
        ) : (
          <TableWrap label="Documents awaiting review">
            <thead>
              <tr>
                <th className={th}>Shipment</th>
                <th className={th}>Requirement</th>
                <th className={th}>File</th>
                <th className={th}>Uploaded</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((doc) => (
                <tr key={doc.id} data-testid="queue-row">
                  <td className={`${td} whitespace-nowrap`}>
                    <Link className="font-medium text-navy-700 hover:underline" href={shipmentHref("operations", doc.shipmentId, "documents")}>
                      {ship.get(doc.shipmentId)?.reference}
                    </Link>
                    <div className="text-xs text-slate-500">{clientName.get(doc.clientId)}</div>
                  </td>
                  <td className={td}>{doc.requirementId ? reqLabel.get(doc.requirementId) : DOC_TYPE_LABEL[doc.docType]}</td>
                  <td className={td}>
                    <button type="button" onClick={() => setViewing(doc)} className="inline-flex items-center gap-1 text-navy-700 hover:underline">
                      <FileText className="size-3.5" aria-hidden /> {doc.fileName}
                    </button>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDateTime(doc.uploadedAt)}</td>
                  <td className={td}>
                    {writable && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          pending={accept.isPending && accept.variables?.id === doc.id}
                          disabled={accept.isPending}
                          onClick={async () => {
                            try {
                              await accept.mutateAsync(doc);
                              toast("success", "Document accepted.");
                            } catch (e) {
                              toast("danger", errorMessage(e));
                            }
                          }}
                        >
                          <Check className="size-3.5" aria-hidden /> Accept
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRejecting(doc)}>
                          <X className="size-3.5" aria-hidden /> Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <Card>
        <CardHeader title={`Files with incomplete documents (${incomplete.length})`} description="Active files where not every required document is accepted yet." />
        {incomplete.length === 0 ? (
          <EmptyState title="Every active file has its required documents." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {incomplete.map((r) => {
              const outstanding = views.filter((v) => v.requirement.shipmentId === r.shipment.id && v.state !== "accepted");
              return (
                <li key={r.shipment.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link className="font-medium text-navy-700 hover:underline" href={shipmentHref("operations", r.shipment.id, "documents")}>
                      {r.shipment.reference}
                    </Link>
                    <span className="text-slate-600">{r.clientShortName}</span>
                    <ReadinessBadge r={r.readiness} />
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {outstanding.map((v) => (
                      <li key={v.requirement.id} className="flex items-center gap-1.5 text-xs">
                        {v.requirement.label} <RequirementBadge state={v.state} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
      <RejectModal doc={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}
