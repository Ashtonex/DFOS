"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { CATEGORY_LABEL, MODE_LABEL, STAGE_LABEL } from "@/domain/labels";
import type { ShipmentDetail } from "@/data/repository";
import { useShipmentDetail, useViewer } from "@/lib/hooks";
import { canWrite, workspaceOfPath } from "@/lib/persona";
import { shipmentBase } from "@/lib/links";
import { useUrlState } from "@/lib/useUrlState";
import { ReadinessBadge, StageBadge } from "../status";
import { Alert, Badge, Button, Card, CardHeader, DefinitionList, ErrorState, LoadingBlock, PageHeader, cx, formatDate, formatDateTime } from "../ui";
import { ShipmentEditForm } from "./ShipmentEditForm";
import { AssignmentCard, WorkflowPanel } from "./WorkflowPanel";
import { DocumentsPanel } from "../documents/DocumentsPanel";
import { FinanceTab } from "./FinanceTab";
import { TasksExceptionsTab } from "./TasksExceptionsTab";
import { AttentionFlags } from "./ShipmentListPage";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "milestones", label: "Milestones" },
  { id: "tasks", label: "Tasks & exceptions" },
  { id: "finance", label: "Finance" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ShipmentDetailPage({ shipmentId }: { shipmentId: string }) {
  const { data, error, isPending, refetch } = useShipmentDetail(shipmentId);
  const pathname = usePathname();
  const ws = workspaceOfPath(pathname) ?? "operations";
  const url = useUrlState();
  const tabParam = url.get("tab", "overview");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";
  const back = shipmentBase(ws);

  if (isPending) return <LoadingBlock label="Loading shipment…" rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data)
    return (
      <div className="mx-auto max-w-lg" data-testid="not-found">
        <Alert tone="warning" title="Shipment not found">
          This file does not exist or is not available in this workspace.
        </Alert>
        <Link href={back} className="mt-3 inline-block text-sm text-navy-700 underline">
          Back to shipments
        </Link>
      </div>
    );

  const s = data.shipment;
  return (
    <div data-testid="shipment-detail">
      <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Shipments
      </Link>
      <PageHeader
        eyebrow={`${data.client.name} · ${CATEGORY_LABEL[s.category]} · ${MODE_LABEL[s.mode]}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span data-testid="detail-reference">{s.reference}</span>
            <StageBadge stage={s.stage} />
            <ReadinessBadge r={data.row.readiness} />
          </span>
        }
        subtitle={<span data-testid="detail-description">{s.description}</span>}
        actions={<AttentionFlags r={data.row} />}
      />
      <nav aria-label="Shipment sections" className="mb-4 overflow-x-auto border-b border-slate-200">
        <ul className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={`${pathname}?tab=${t.id}`}
                scroll={false}
                aria-current={tab === t.id ? "page" : undefined}
                className={cx(
                  "inline-block border-b-2 px-3 py-2 text-sm",
                  tab === t.id ? "border-navy-900 font-medium text-navy-900" : "border-transparent text-slate-600 hover:text-slate-900",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "overview" && <OverviewTab d={data} />}
      {tab === "documents" && <DocumentsPanel d={data} mode="staff" />}
      {tab === "milestones" && <MilestonesTab d={data} />}
      {tab === "tasks" && <TasksExceptionsTab d={data} />}
      {tab === "finance" && <FinanceTab d={data} />}
      {tab === "activity" && <ActivityTab d={data} />}
    </div>
  );
}

function OverviewTab({ d }: { d: ShipmentDetail }) {
  const { persona } = useViewer();
  const [editing, setEditing] = useState(false);
  const s = d.shipment;
  const writable = canWrite(persona) && s.stage !== "closed";
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Shipment details"
          description={`Version ${s.version} · updated ${formatDateTime(s.updatedAt)}`}
          actions={
            writable && !editing ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} data-testid="edit-shipment">
                <Pencil className="size-3.5" aria-hidden /> Edit details
              </Button>
            ) : null
          }
        />
        <div className="p-4">
          {editing ? (
            <ShipmentEditForm shipment={s} onDone={() => setEditing(false)} />
          ) : (
            <DefinitionList
              items={[
                ["File reference", s.reference],
                ["Client", d.client.name],
                ["Goods description", s.description],
                ["Category / mode", `${CATEGORY_LABEL[s.category]} · ${MODE_LABEL[s.mode]}`],
                ["Origin", s.origin],
                ["Destination", s.destination],
                ["Border / processing location", s.borderPost],
                ["Assigned officer", d.officer?.name ?? <Badge tone="warning">Unassigned</Badge>],
                ["Operational stage", STAGE_LABEL[s.stage]],
                [
                  "External / submission reference",
                  s.externalReference ? (
                    <span>
                      {s.externalReference} <Badge tone="neutral">Manually recorded</Badge>
                    </span>
                  ) : null,
                ],
                ["Expected arrival", formatDate(s.expectedArrival)],
                ["Expected delivery", formatDate(s.expectedDelivery)],
                ["Client reference", s.clientReference],
                ["Created", formatDateTime(s.createdAt)],
              ]}
            />
          )}
          {!editing && s.internalNotes && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="text-xs font-semibold text-amber-900">Internal notes (staff only)</div>
              <p className="mt-1 whitespace-pre-wrap text-amber-950" data-testid="internal-notes">
                {s.internalNotes}
              </p>
            </div>
          )}
        </div>
      </Card>
      <div className="space-y-4">
        <WorkflowPanel d={d} />
        <AssignmentCard d={d} />
        <Card>
          <CardHeader title="Recent activity" />
          <ActivityList items={d.activity.slice(0, 6)} users={d.users} />
        </Card>
      </div>
    </div>
  );
}

function MilestonesTab({ d }: { d: ShipmentDetail }) {
  return (
    <Card>
      <CardHeader title="Milestones" description="Every stage change with who made it and when." />
      <ol className="divide-y divide-slate-100">
        {d.milestones.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <StageBadge stage={m.stage} />
            <span className="text-slate-600">{formatDateTime(m.at)}</span>
            <span className="text-slate-600">by {d.users.find((u) => u.id === m.byUserId)?.name ?? "—"}</span>
            {m.override && <Badge tone="danger">Override</Badge>}
            {m.note && <span className="text-slate-800">{m.note}</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ActivityTab({ d }: { d: ShipmentDetail }) {
  return (
    <Card>
      <CardHeader title="Activity history" description="Audit trail of changes to this file." />
      <ActivityList items={d.activity} users={d.users} />
    </Card>
  );
}

export function ActivityList({ items, users }: { items: ShipmentDetail["activity"]; users: ShipmentDetail["users"] }) {
  if (items.length === 0) return <p className="px-4 py-6 text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="divide-y divide-slate-100" data-testid="activity-list">
      {items.map((a) => (
        <li key={a.id} className="px-4 py-2.5 text-sm">
          <div className="text-slate-900">{a.summary}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {formatDateTime(a.at)} · {users.find((u) => u.id === a.actorId)?.name ?? "System"}
          </div>
        </li>
      ))}
    </ol>
  );
}
