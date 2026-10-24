"use client";
import type { FundingRequestStatus } from "@/domain/finance";
import {
  DOC_STATUS_LABEL,
  FUNDING_STATUS_LABEL,
  REQUIREMENT_STATE_LABEL,
  STAGE_CLIENT_LABEL,
  STAGE_LABEL,
  STATUS_SOURCE_LABEL,
} from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import type { Readiness, RequirementState } from "@/domain/rules";
import type { Currency, DocumentStatus, Stage } from "@/domain/types";
import { Badge, type Tone } from "./ui";

const STAGE_TONE: Record<Stage, Tone> = {
  new_request: "info",
  preparation: "neutral",
  ready_for_submission: "accent",
  submitted: "info",
  released: "accent",
  in_delivery: "accent",
  delivered: "success",
  closed: "neutral",
};

export function StageBadge({ stage, client }: { stage: Stage; client?: boolean }) {
  return <Badge tone={STAGE_TONE[stage]}>{client ? STAGE_CLIENT_LABEL[stage] : STAGE_LABEL[stage]}</Badge>;
}

export function ReadinessBadge({ r }: { r: Readiness }) {
  if (r.status === "complete") return <Badge tone="success">Docs complete {r.accepted}/{r.required}</Badge>;
  const tone: Tone = r.rejected > 0 || r.missing > 0 ? "warning" : "info";
  return (
    <Badge tone={tone}>
      Docs {r.accepted}/{r.required}
      {r.rejected > 0 && ` · ${r.rejected} rejected`}
      {r.missing > 0 && ` · ${r.missing} missing`}
      {r.underReview > 0 && ` · ${r.underReview} in review`}
    </Badge>
  );
}

export function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const tone: Tone = status === "accepted" ? "success" : status === "rejected" ? "danger" : "info";
  return <Badge tone={tone}>{DOC_STATUS_LABEL[status]}</Badge>;
}

export function RequirementBadge({ state }: { state: RequirementState }) {
  const tone: Tone = state === "accepted" ? "success" : state === "rejected" ? "danger" : state === "missing" ? "warning" : "info";
  return <Badge tone={tone}>{REQUIREMENT_STATE_LABEL[state]}</Badge>;
}

export function FundingBadge({ status }: { status: FundingRequestStatus }) {
  const tone: Tone =
    status === "funded" ? "success" : status === "cancelled" ? "neutral" : status === "payment_notified" ? "info" : "warning";
  return <Badge tone={tone}>{FUNDING_STATUS_LABEL[status]}</Badge>;
}

export function SourceBadge({ source }: { source: keyof typeof STATUS_SOURCE_LABEL }) {
  return (
    <Badge tone="neutral" className="italic">
      {STATUS_SOURCE_LABEL[source]}
    </Badge>
  );
}

export function Money({ minor, currency, className }: { minor: number; currency: Currency; className?: string }) {
  return <span className={`tabular whitespace-nowrap ${className ?? ""}`}>{formatMoney(minor, currency)}</span>;
}
