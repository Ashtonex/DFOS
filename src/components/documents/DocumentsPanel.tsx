"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Upload, X } from "lucide-react";
import * as repo from "@/data/repository";
import { DomainError, errorMessage } from "@/data/errors";
import { checkUpload, formatBytes } from "@/domain/files";
import { DOC_TYPE_LABEL } from "@/domain/labels";
import { UPLOAD_LIMITS, type RequirementView } from "@/domain/rules";
import type { DocType, ShipmentDocument, User } from "@/domain/types";
import { useDfosMutation, useOpId, useViewer } from "@/lib/hooks";
import { canWrite } from "@/lib/persona";
import { TOPICS } from "@/lib/queryKeys";
import type { ShipmentDetail } from "@/data/repository";
import { DocStatusBadge, RequirementBadge } from "../status";
import { useToast } from "../toast";
import { Alert, Button, Card, CardHeader, Modal, TextAreaField, formatDateTime } from "../ui";
import { DocumentViewer } from "./DocumentViewer";

const ACCEPT = Object.values(UPLOAD_LIMITS.types).flat().join(",");

export function DocumentsPanel({ d, mode }: { d: ShipmentDetail; mode: "staff" | "client" }) {
  const { persona } = useViewer();
  const [viewing, setViewing] = useState<ShipmentDocument | null>(null);
  const [uploadFor, setUploadFor] = useState<{ requirementId: string | null; docType: DocType; label: string } | null>(null);
  const [rejecting, setRejecting] = useState<ShipmentDocument | null>(null);
  const closed = d.shipment.stage === "closed";
  const staffWrite = mode === "staff" && canWrite(persona) && !closed;
  const clientWrite = mode === "client" && !closed;
  const evidence = d.documents.filter((x) => x.requirementId === null);
  const nameOf = (id: string) => d.users.find((u) => u.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Required documents"
          description={`Prototype rule: all required documents must be accepted before the file is ready for submission. Limits: PDF, PNG, JPEG or TXT, up to ${UPLOAD_LIMITS.maxBytes / 1048576} MB.`}
        />
        <ul className="divide-y divide-slate-100" data-testid="requirements">
          {d.requirements.map((v) => (
            <RequirementItem
              key={v.requirement.id}
              v={v}
              users={d.users}
              mode={mode}
              canUpload={(clientWrite || staffWrite) && (v.state === "missing" || v.state === "rejected")}
              canReview={staffWrite}
              onView={setViewing}
              onUpload={() => setUploadFor({ requirementId: v.requirement.id, docType: v.requirement.docType, label: v.requirement.label })}
              onReject={setRejecting}
            />
          ))}
        </ul>
      </Card>

      {(mode === "staff" || evidence.length > 0) && (
        <Card>
          <CardHeader title="Stage evidence" description="Release evidence and proof of delivery, attached by Divine Freight staff." />
          <div className="divide-y divide-slate-100">
            {(["release_evidence", "proof_of_delivery"] as const).map((type) => {
              const docs = evidence.filter((x) => x.docType === type);
              const allowed =
                type === "release_evidence"
                  ? ["submitted", "released"].includes(d.shipment.stage)
                  : ["released", "in_delivery", "delivered"].includes(d.shipment.stage);
              return (
                <div key={type} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{DOC_TYPE_LABEL[type]}</div>
                    {docs.length === 0 ? (
                      <p className="text-xs text-slate-500">Not attached yet.</p>
                    ) : (
                      docs.map((doc) => (
                        <button key={doc.id} type="button" onClick={() => setViewing(doc)} className="mt-1 flex items-center gap-1.5 text-sm text-navy-700 hover:underline">
                          <FileText className="size-4" aria-hidden /> {doc.fileName}
                          <span className="text-xs text-slate-500">· {formatDateTime(doc.uploadedAt)} · {nameOf(doc.uploadedById)}</span>
                        </button>
                      ))
                    )}
                  </div>
                  {staffWrite && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!allowed}
                      title={allowed ? undefined : type === "release_evidence" ? "Available once the entry is submitted" : "Available once goods are released"}
                      onClick={() => setUploadFor({ requirementId: null, docType: type, label: DOC_TYPE_LABEL[type] })}
                      data-testid={`attach-${type}`}
                    >
                      <Upload className="size-3.5" aria-hidden /> Attach
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <UploadModal target={uploadFor} shipmentId={d.shipment.id} mode={mode} onClose={() => setUploadFor(null)} />
      <RejectModal doc={rejecting} onClose={() => setRejecting(null)} />
      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function RequirementItem({
  v,
  users,
  mode,
  canUpload,
  canReview,
  onView,
  onUpload,
  onReject,
}: {
  v: RequirementView;
  users: User[];
  mode: "staff" | "client";
  canUpload: boolean;
  canReview: boolean;
  onView: (d: ShipmentDocument) => void;
  onUpload: () => void;
  onReject: (d: ShipmentDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const accept = useDfosMutation({
    mutationFn: (p, docId: string) => repo.reviewDocument(p.userId, docId, "accept"),
    topics: TOPICS.documents,
    shipmentId: () => v.requirement.shipmentId,
  });
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? "—";
  const latest = v.history[0];
  const pending = latest?.status === "pending_review" ? latest : null;
  return (
    <li className="px-4 py-3" data-testid="requirement" data-requirement={v.requirement.docType}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
          disabled={v.history.length === 0}
        >
          {v.history.length > 0 ? (
            open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span className="truncate">{v.requirement.label}</span>
          {v.history.length > 1 && <span className="text-xs font-normal text-slate-500">({v.history.length} uploads)</span>}
        </button>
        <RequirementBadge state={v.state} />
        <div className="flex flex-wrap gap-2">
          {latest && (
            <Button variant="ghost" size="sm" onClick={() => onView(v.latest ?? latest)}>
              <FileText className="size-3.5" aria-hidden /> View
            </Button>
          )}
          {canReview && pending && (
            <>
              <Button
                size="sm"
                pending={accept.isPending}
                data-testid="accept-document"
                onClick={async () => {
                  try {
                    await accept.mutateAsync(pending.id);
                    toast("success", `${v.requirement.label} accepted.`);
                  } catch (e) {
                    toast("danger", errorMessage(e));
                  }
                }}
              >
                <Check className="size-3.5" aria-hidden /> Accept
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onReject(pending)} data-testid="reject-document">
                <X className="size-3.5" aria-hidden /> Reject
              </Button>
            </>
          )}
          {canUpload && (
            <Button variant={mode === "client" ? "primary" : "secondary"} size="sm" onClick={onUpload} data-testid="upload-requirement">
              <Upload className="size-3.5" aria-hidden /> {v.state === "rejected" ? "Upload replacement" : mode === "client" ? "Upload" : "Upload for client"}
            </Button>
          )}
        </div>
      </div>
      {v.state === "rejected" && latest?.rejectionReason && (
        <p className="mt-1.5 ml-5.5 text-xs text-red-800" data-testid="rejection-reason">
          Rejected: {latest.rejectionReason}
        </p>
      )}
      {open && v.history.length > 0 && (
        <ol className="mt-2 ml-5.5 space-y-1.5 border-l border-slate-200 pl-3" aria-label={`${v.requirement.label} history`}>
          {v.history.map((doc) => (
            <li key={doc.id} className="text-xs text-slate-600">
              <button type="button" className="font-medium text-navy-700 hover:underline" onClick={() => onView(doc)}>
                {doc.fileName}
              </button>{" "}
              <DocStatusBadge status={doc.status} /> · uploaded {formatDateTime(doc.uploadedAt)} by {nameOf(doc.uploadedById)} · {formatBytes(doc.size)}
              {doc.reviewedAt && ` · reviewed ${formatDateTime(doc.reviewedAt)}${mode === "staff" ? ` by ${nameOf(doc.reviewedById)}` : ""}`}
              {doc.rejectionReason && <span className="block text-red-800">Reason: {doc.rejectionReason}</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function UploadModal({
  target,
  shipmentId,
  mode,
  onClose,
}: {
  target: { requirementId: string | null; docType: DocType; label: string } | null;
  shipmentId: string;
  mode: "staff" | "client";
  onClose: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opId, renewOpId] = useOpId();
  const upload = useDfosMutation({
    mutationFn: (p, v: { file: File; data: ArrayBuffer }) =>
      repo.uploadDocument(
        p.userId,
        { shipmentId, requirementId: target!.requirementId, docType: target!.docType, fileName: v.file.name, data: v.data },
        opId,
      ),
    topics: TOPICS.documents,
    shipmentId: () => shipmentId,
  });
  const close = () => {
    setFile(null);
    setError(null);
    onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (upload.isPending) return;
    if (!file) return setError("Choose a file to upload.");
    const data = await file.arrayBuffer();
    const check = checkUpload(file.name, data);
    if (!check.ok) return setError(check.error);
    try {
      await upload.mutateAsync({ file, data });
      renewOpId();
      toast("success", `${target!.label} uploaded${mode === "client" ? " and sent for review" : ""}.`);
      close();
    } catch (err) {
      setError(err instanceof DomainError && err.fieldErrors?.file ? err.fieldErrors.file : errorMessage(err));
    }
  };
  return (
    <Modal
      open={!!target}
      onClose={close}
      title={`Upload: ${target?.label ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="upload-form" pending={upload.isPending} data-testid="confirm-upload">
            Upload
          </Button>
        </>
      }
    >
      <form id="upload-form" onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="upload-file" className="mb-1 block text-xs font-medium text-slate-700">
            File (PDF, PNG, JPEG or TXT, up to 5 MB)
          </label>
          <input
            id="upload-file"
            type="file"
            accept={ACCEPT}
            data-testid="upload-input"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "upload-error" : undefined}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
          />
          {error && (
            <p id="upload-error" className="mt-1 text-xs font-medium text-red-700" data-testid="upload-error">
              {error}
            </p>
          )}
        </div>
        {target?.requirementId === null && (
          <Alert tone="info">Stage evidence uploaded by staff is recorded as accepted immediately and is visible to the client.</Alert>
        )}
        {mode === "client" && <p className="text-xs text-slate-500">Divine Freight will review the document and accept it or explain what needs changing.</p>}
      </form>
    </Modal>
  );
}

export function RejectModal({ doc, onClose }: { doc: ShipmentDocument | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reject = useDfosMutation({
    mutationFn: (p, v: { id: string; reason: string }) => repo.reviewDocument(p.userId, v.id, "reject", v.reason),
    topics: TOPICS.documents,
    shipmentId: () => doc?.shipmentId,
  });
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  return (
    <Modal
      open={!!doc}
      onClose={close}
      title={`Reject ${doc ? DOC_TYPE_LABEL[doc.docType].toLowerCase() : "document"}`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            pending={reject.isPending}
            data-testid="confirm-reject"
            onClick={async () => {
              if (!reason.trim()) return setError("Give the client a reason for rejecting.");
              try {
                await reject.mutateAsync({ id: doc!.id, reason });
                toast("success", "Document rejected. The client has been asked to resubmit.");
                close();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Reject document
          </Button>
        </>
      }
    >
      <TextAreaField
        label="Reason (shown to the client)"
        required
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
        error={error ?? undefined}
        data-testid="reject-reason"
      />
    </Modal>
  );
}
