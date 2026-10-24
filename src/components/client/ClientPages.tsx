"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, PlusCircle } from "lucide-react";
import { CATEGORY_LABEL, MODE_LABEL } from "@/domain/labels";
import { requirementViews } from "@/domain/rules";
import { fundingRequestStatus } from "@/domain/finance";
import { useShipmentDetail, useViewer, useWorkspace } from "@/lib/hooks";
import { useUrlState } from "@/lib/useUrlState";
import type { ShipmentDetail } from "@/data/repository";
import { DocumentsPanel } from "../documents/DocumentsPanel";
import { ReadinessBadge, RequirementBadge, StageBadge, FundingBadge, Money } from "../status";
import { Alert, Card, CardHeader, DefinitionList, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, TableWrap, cx, formatDate, formatDateTime, td, th } from "../ui";
import { KpiTile } from "../pages/KpiTile";
import { ProgressTracker } from "./ProgressTracker";
import { ClientPaymentsPanel } from "./ClientPayments";

export function ClientOverview() {
  const { persona } = useViewer();
  const { data, error, isPending, refetch } = useWorkspace();
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const active = data.rows.filter((r) => r.shipment.stage !== "closed");
  const activeIds = new Set(active.map((r) => r.shipment.id));
  const outstanding = requirementViews(
    s.requirements.filter((r) => activeIds.has(r.shipmentId) && r.required),
    s.documents,
  ).filter((v) => v.state === "missing" || v.state === "rejected");
  const openFunding = s.fundingRequests.filter((f) => {
    const st = fundingRequestStatus(f, s.receipts, s.notifications);
    return st === "awaiting_payment" || st === "partially_funded" || st === "payment_notified";
  });
  const refOf = (id: string) => s.shipments.find((x) => x.id === id)?.reference ?? "";
  return (
    <div>
      <PageHeader
        eyebrow={s.clients[0]?.name}
        title={`Welcome, ${persona?.name.split(" ")[0] ?? ""}`}
        subtitle="Your shipments with Divine Freight, what we need from you, and the latest progress."
        actions={
          <LinkButton href="/client/shipments/new" variant="primary">
            <PlusCircle className="size-4" aria-hidden /> New shipment request
          </LinkButton>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile href="/client/shipments" label="Active shipments" value={active.length} testId="client-active" />
        <KpiTile href="/client/documents" label="Documents needed from you" value={outstanding.length} tone={outstanding.length ? "warning" : undefined} testId="client-docs-needed" />
        <KpiTile href="/client/requests" label="Funding requests open" value={openFunding.length} tone={openFunding.length ? "warning" : undefined} testId="client-funding-open" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="What we need from you" />
          {outstanding.length === 0 ? (
            <EmptyState title="Nothing outstanding. Thank you!" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {outstanding.map((v) => (
                <li key={v.requirement.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    <Link className="font-medium text-navy-700 hover:underline" href={`/client/shipments/${v.requirement.shipmentId}?tab=documents`}>
                      {refOf(v.requirement.shipmentId)}
                    </Link>{" "}
                    · {v.requirement.label}
                  </span>
                  <RequirementBadge state={v.state} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Funding requests" />
          {openFunding.length === 0 ? (
            <EmptyState title="No open funding requests." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {openFunding.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    <Link className="font-medium text-navy-700 hover:underline" href={`/client/shipments/${f.shipmentId}?tab=payments`}>
                      {refOf(f.shipmentId)}
                    </Link>{" "}
                    · {f.purpose} · <Money minor={f.amount} currency={f.currency} />
                  </span>
                  <FundingBadge status={fundingRequestStatus(f, s.receipts, s.notifications)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Latest updates" />
          <ul className="divide-y divide-slate-100" data-testid="client-updates">
            {[...s.activity]
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 8)
              .map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <Link className="font-medium text-navy-700 hover:underline" href={`/client/shipments/${a.shipmentId}`}>
                    {refOf(a.shipmentId!)}
                  </Link>{" "}
                  {a.summary}
                  <span className="block text-xs text-slate-500">{formatDateTime(a.at)}</span>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export function ClientShipmentList() {
  const { data, error, isPending, refetch } = useWorkspace();
  const url = useUrlState();
  const show = url.get("show", "active");
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const rows = data.rows
    .filter((r) => (show === "all" ? true : show === "closed" ? r.shipment.stage === "closed" : r.shipment.stage !== "closed"))
    .sort((a, b) => b.shipment.createdAt.localeCompare(a.shipment.createdAt));
  return (
    <div>
      <PageHeader
        title="My shipments"
        actions={
          <LinkButton href="/client/shipments/new" variant="primary">
            <PlusCircle className="size-4" aria-hidden /> New request
          </LinkButton>
        }
      />
      <div className="mb-3 flex gap-1" role="group" aria-label="Show">
        {(["active", "closed", "all"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={show === k}
            onClick={() => url.set({ show: k === "active" ? null : k })}
            className={cx("rounded-md px-3 py-1.5 text-sm capitalize", show === k ? "bg-navy-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50")}
          >
            {k}
          </button>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No shipments here yet." />
        ) : (
          <TableWrap label="My shipments">
            <thead>
              <tr>
                <th className={th}>Reference</th>
                <th className={th}>Goods / route</th>
                <th className={th}>Progress</th>
                <th className={th}>Documents</th>
                <th className={th}>Expected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.shipment.id} data-testid="client-shipment-row">
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={`/client/shipments/${r.shipment.id}`} className="font-medium text-navy-700 hover:underline">
                      {r.shipment.reference}
                    </Link>
                  </td>
                  <td className={td}>
                    <div>{r.shipment.description}</div>
                    <div className="text-xs text-slate-500">
                      {r.shipment.origin} → {r.shipment.borderPost} → {r.shipment.destination}
                    </div>
                  </td>
                  <td className={td}>
                    <StageBadge stage={r.shipment.stage} client />
                  </td>
                  <td className={td}>
                    <ReadinessBadge r={r.readiness} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.shipment.expectedArrival)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

const CLIENT_TABS = [
  { id: "overview", label: "Progress" },
  { id: "documents", label: "Documents" },
  { id: "payments", label: "Funding & payments" },
] as const;

export function ClientShipmentDetail({ shipmentId }: { shipmentId: string }) {
  const { data, error, isPending, refetch } = useShipmentDetail(shipmentId);
  const pathname = usePathname();
  const url = useUrlState();
  const tabParam = url.get("tab", "overview");
  const tab = CLIENT_TABS.some((t) => t.id === tabParam) ? tabParam : "overview";
  if (isPending) return <LoadingBlock rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data)
    return (
      <div className="mx-auto max-w-lg" data-testid="not-found">
        <Alert tone="warning" title="Shipment not found">
          This shipment does not exist or is not part of your account.
        </Alert>
        <Link href="/client/shipments" className="mt-3 inline-block text-sm text-navy-700 underline">
          Back to my shipments
        </Link>
      </div>
    );
  const s = data.shipment;
  return (
    <div data-testid="shipment-detail">
      <Link href="/client/shipments" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> My shipments
      </Link>
      <PageHeader
        eyebrow={`${CATEGORY_LABEL[s.category]} · ${MODE_LABEL[s.mode]} · ${s.origin} → ${s.borderPost} → ${s.destination}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span data-testid="detail-reference">{s.reference}</span>
            <StageBadge stage={s.stage} client />
          </span>
        }
        subtitle={<span data-testid="detail-description">{s.description}</span>}
      />
      <nav aria-label="Shipment sections" className="mb-4 overflow-x-auto border-b border-slate-200">
        <ul className="flex min-w-max gap-1">
          {CLIENT_TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={`${pathname}?tab=${t.id}`}
                scroll={false}
                aria-current={tab === t.id ? "page" : undefined}
                className={cx("inline-block border-b-2 px-3 py-2 text-sm", tab === t.id ? "border-navy-900 font-medium text-navy-900" : "border-transparent text-slate-600 hover:text-slate-900")}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "overview" && <ClientProgress d={data} />}
      {tab === "documents" && <DocumentsPanel d={data} mode="client" />}
      {tab === "payments" && <ClientPaymentsPanel d={data} />}
    </div>
  );
}

function ClientProgress({ d }: { d: ShipmentDetail }) {
  const s = d.shipment;
  const outstanding = d.requirements.filter((v) => v.state === "missing" || v.state === "rejected");
  return (
    <div className="space-y-4">
      <ProgressTracker stage={s.stage} milestones={d.milestones} />
      {outstanding.length > 0 && (
        <Alert tone="warning" title={`${outstanding.length} document(s) needed from you`}>
          {outstanding.map((v) => v.requirement.label).join(", ")}.{" "}
          <Link href="?tab=documents" className="font-medium underline" scroll={false}>
            Upload now
          </Link>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Shipment summary" />
          <div className="p-4">
            <DefinitionList
              items={[
                ["Reference", s.reference],
                ["Your reference", s.clientReference],
                ["Goods", s.description],
                ["Route", `${s.origin} → ${s.borderPost} → ${s.destination}`],
                ["Clearance officer", d.officer?.name ?? "Being assigned"],
                ["Documents", <ReadinessBadge key="r" r={d.row.readiness} />],
                ["Divine Freight lodgement reference", s.lodgementReference ?? null],
                [
                  "Customs reference",
                  s.externalReference ? `${s.externalReference} (recorded by Divine Freight)` : s.lodgementReference ? "Awaited from customs" : null,
                ],
                ["Expected arrival", formatDate(s.expectedArrival)],
                ["Expected delivery", formatDate(s.expectedDelivery)],
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Progress updates" />
          <ol className="divide-y divide-slate-100" data-testid="client-activity">
            {d.activity.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                {a.summary}
                <span className="block text-xs text-slate-500">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

export function ClientDocumentsPage() {
  const { data, error, isPending, refetch } = useWorkspace();
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const views = requirementViews(s.requirements, s.documents);
  const refOf = (id: string) => s.shipments.find((x) => x.id === id);
  const outstanding = views.filter((v) => (v.state === "missing" || v.state === "rejected") && refOf(v.requirement.shipmentId)?.stage !== "closed");
  const docs = [...s.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return (
    <div>
      <PageHeader title="Documents" subtitle="What we still need from you, and every document on your files." />
      <Card className="mb-4">
        <CardHeader title={`Outstanding (${outstanding.length})`} />
        {outstanding.length === 0 ? (
          <EmptyState title="Nothing outstanding." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="client-outstanding">
            {outstanding.map((v) => (
              <li key={v.requirement.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <Link className="font-medium text-navy-700 hover:underline" href={`/client/shipments/${v.requirement.shipmentId}?tab=documents`}>
                    {refOf(v.requirement.shipmentId)?.reference}
                  </Link>{" "}
                  · {v.requirement.label}
                  {v.state === "rejected" && v.latest?.rejectionReason && <span className="block text-xs text-red-800">Rejected: {v.latest.rejectionReason}</span>}
                </span>
                <RequirementBadge state={v.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="All documents" />
        <TableWrap label="All documents">
          <thead>
            <tr>
              <th className={th}>File</th>
              <th className={th}>Shipment</th>
              <th className={th}>Type</th>
              <th className={th}>Status</th>
              <th className={th}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} data-testid="client-document-row">
                <td className={td}>{doc.fileName}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <Link className="text-navy-700 hover:underline" href={`/client/shipments/${doc.shipmentId}?tab=documents`}>
                    {refOf(doc.shipmentId)?.reference}
                  </Link>
                </td>
                <td className={td}>{doc.docType.replace(/_/g, " ")}</td>
                <td className={td}>
                  <RequirementBadge state={doc.status === "accepted" ? "accepted" : doc.status === "rejected" ? "rejected" : "under_review"} />
                </td>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(doc.uploadedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
