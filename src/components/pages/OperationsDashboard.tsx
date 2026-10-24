"use client";
import { kpiCounts, SHIPMENT_KPIS, type KpiKey } from "@/domain/derive";
import { useWorkspace } from "@/lib/hooks";
import { ErrorState, LoadingBlock, PageHeader } from "../ui";
import { KpiTile } from "./KpiTile";

const OPS_KPIS: { key: KpiKey; tone?: "warning" | "danger" }[] = [
  { key: "active" },
  { key: "unassigned", tone: "warning" },
  { key: "awaiting_documents", tone: "warning" },
  { key: "docs_to_review", tone: "warning" },
  { key: "awaiting_funds", tone: "warning" },
  { key: "payments_to_verify", tone: "warning" },
  { key: "external_delays", tone: "danger" },
  { key: "overdue_followups", tone: "danger" },
  { key: "ready_to_close" },
];

export function OperationsDashboard() {
  const { data, error, isPending, refetch } = useWorkspace();
  return (
    <div>
      <PageHeader title="Operations dashboard" subtitle="Every figure is counted from stored records. Select a figure to open exactly those files." />
      {isPending ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {OPS_KPIS.map(({ key, tone }) => {
            const n = kpiCounts(data.rows)[key];
            return (
              <KpiTile
                key={key}
                testId={`kpi-${key}`}
                href={`/operations/shipments?kpi=${key}`}
                label={SHIPMENT_KPIS[key].label}
                value={n}
                hint={SHIPMENT_KPIS[key].description}
                tone={n > 0 ? tone : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
