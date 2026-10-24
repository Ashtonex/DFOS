"use client";
import Link from "next/link";
import { kpiCounts, kpiRows, portfolioFinance, SHIPMENT_KPIS, type KpiKey, type ShipmentRow } from "@/domain/derive";
import { totalsList } from "@/domain/finance";
import { formatBasisPoints } from "@/domain/money";
import { isOverdue } from "@/domain/rules";
import { useWorkspace } from "@/lib/hooks";
import { useUrlState } from "@/lib/useUrlState";
import { FinanceSummaryCards } from "../shipments/FinanceTab";
import { Money, StageBadge } from "../status";
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, TableWrap, td, th } from "../ui";
import { KpiTile } from "./KpiTile";

const MGMT_KPIS: { key: KpiKey; tone?: "warning" | "danger" }[] = [
  { key: "active" },
  { key: "awaiting_documents", tone: "warning" },
  { key: "awaiting_funds", tone: "warning" },
  { key: "external_delays", tone: "danger" },
  { key: "overdue_followups", tone: "danger" },
  { key: "unrecovered", tone: "danger" },
  { key: "ready_to_close" },
  { key: "closed" },
];

const drill = (kpi: KpiKey, extra = "") => `/management/shipments?kpi=${kpi}${extra}`;

export function officerWorkload(rows: ShipmentRow[], data: NonNullable<ReturnType<typeof useWorkspace>["data"]>) {
  const s = data.snapshot;
  return s.users
    .filter((u) => u.role === "officer" || u.role === "operations_supervisor")
    .map((u) => {
      const mine = kpiRows(rows, "active").filter((r) => r.shipment.assignedOfficerId === u.id);
      const tasks = s.tasks.filter((t) => t.assigneeId === u.id && t.status === "open");
      return {
        user: u,
        active: mine.length,
        awaitingDocs: mine.filter(SHIPMENT_KPIS.awaiting_documents.test).length,
        openTasks: tasks.length,
        overdueTasks: tasks.filter((t) => isOverdue(t.dueDate, data.today)).length,
        openExceptions: s.exceptions.filter((e) => e.ownerId === u.id && e.status === "open").length,
      };
    });
}

export function ManagementDashboard() {
  const { data, error, isPending, refetch } = useWorkspace();
  if (isPending) return <LoadingBlock rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const counts = kpiCounts(data.rows);
  const portfolio = totalsList(portfolioFinance(data.rows));
  const active = portfolioFinance(kpiRows(data.rows, "active"));
  const workload = officerWorkload(data.rows, data);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Management overview"
        subtitle="Every figure is computed from stored records. Select any figure to see exactly the files behind it."
      />
      <section aria-labelledby="ops-kpis">
        <h2 id="ops-kpis" className="mb-2 text-sm font-semibold text-slate-700">Operations</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {MGMT_KPIS.map(({ key, tone }) => (
            <KpiTile
              key={key}
              testId={`mkpi-${key}`}
              href={drill(key)}
              label={SHIPMENT_KPIS[key].label}
              value={counts[key]}
              hint={SHIPMENT_KPIS[key].description}
              tone={counts[key] > 0 ? tone : undefined}
            />
          ))}
        </div>
      </section>
      <section aria-labelledby="money-kpis">
        <h2 id="money-kpis" className="mb-2 text-sm font-semibold text-slate-700">Money (per currency; never combined)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {portfolio.map((t) => (
            <KpiTile
              key={`u-${t.currency}`}
              testId={`money-unrecovered-${t.currency}`}
              href={drill("unrecovered")}
              label={`Unrecovered disbursements (${t.currency})`}
              value={<Money minor={t.unrecoveredDisbursements} currency={t.currency} />}
              hint="Paid on clients' behalf beyond verified funds"
              tone={t.unrecoveredDisbursements > 0 ? "danger" : undefined}
            />
          ))}
          {totalsList(active).map((t) => (
            <KpiTile
              key={`f-${t.currency}`}
              testId={`money-outstanding-${t.currency}`}
              href={drill("awaiting_funds")}
              label={`Client funding outstanding (${t.currency})`}
              value={<Money minor={t.fundingOutstanding} currency={t.currency} />}
              hint="Active files; open requests not yet covered by verified receipts"
              tone={t.fundingOutstanding > 0 ? "warning" : undefined}
            />
          ))}
          {portfolio
            .filter((t) => t.serviceInvoiced > 0)
            .map((t) => (
              <KpiTile
                key={`c-${t.currency}`}
                testId={`money-contribution-${t.currency}`}
                href="/management/finance"
                label={`Illustrative contribution (${t.currency})`}
                value={<Money minor={t.contribution} currency={t.currency} />}
                hint={`Margin ${formatBasisPoints(t.marginBp)} on issued service invoices. Not statutory accounts.`}
              />
            ))}
        </div>
      </section>
      <Card>
        <CardHeader title="Officer workload" actions={<Link className="text-sm text-navy-700 hover:underline" href="/management/performance">Details</Link>} />
        <WorkloadTable rows={workload} />
      </Card>
    </div>
  );
}

function WorkloadTable({ rows }: { rows: ReturnType<typeof officerWorkload> }) {
  return (
    <TableWrap label="Officer workload">
      <thead>
        <tr>
          <th className={th}>Officer</th>
          <th className={th}>Active files</th>
          <th className={th}>Awaiting documents</th>
          <th className={th}>Open tasks</th>
          <th className={th}>Overdue tasks</th>
          <th className={th}>Open exceptions owned</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w) => (
          <tr key={w.user.id} data-testid="workload-row">
            <td className={td}>
              <span className="font-medium">{w.user.name}</span>
              <span className="block text-xs text-slate-500">{w.user.title}</span>
            </td>
            <td className={td}>
              <Link className="tabular text-navy-700 underline" href={drill("active", `&officer=${w.user.id}`)} data-testid="workload-active">
                {w.active}
              </Link>
            </td>
            <td className={td}>
              <Link className="tabular text-navy-700 underline" href={drill("awaiting_documents", `&officer=${w.user.id}`)}>
                {w.awaitingDocs}
              </Link>
            </td>
            <td className={`${td} tabular`}>{w.openTasks}</td>
            <td className={td}>{w.overdueTasks > 0 ? <Badge tone="danger">{w.overdueTasks}</Badge> : <span className="tabular">0</span>}</td>
            <td className={`${td} tabular`}>{w.openExceptions}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function PerformancePage() {
  const { data, error, isPending, refetch } = useWorkspace();
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const workload = officerWorkload(data.rows, data);
  const unassigned = kpiCounts(data.rows).unassigned;
  return (
    <div className="space-y-4">
      <PageHeader title="Officer workload" subtitle="Active files, documents outstanding, tasks and exceptions per officer." />
      <Card>
        <WorkloadTable rows={workload} />
        <p className="px-4 py-3 text-sm text-slate-600">
          Unassigned active requests:{" "}
          <Link className="font-medium text-navy-700 underline" href={drill("unassigned")}>
            {unassigned}
          </Link>
        </p>
      </Card>
    </div>
  );
}

export function ManagementFinancePage() {
  const { data, error, isPending, refetch } = useWorkspace();
  const url = useUrlState();
  const sort = url.get("sort", "contribution");
  if (isPending) return <LoadingBlock rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const lines = data.rows.flatMap((r) => totalsList(r.finance).map((t) => ({ r, t })));
  lines.sort((a, b) =>
    sort === "reference" ? a.r.shipment.reference.localeCompare(b.r.shipment.reference) : sort === "unrecovered" ? b.t.unrecoveredDisbursements - a.t.unrecoveredDisbursements : a.t.contribution - b.t.contribution,
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Illustrative shipment financial performance"
        subtitle="Service revenue measures and Divine Freight's own costs per file. Client money (pass-through funds and disbursements) is shown separately and is never treated as revenue. Illustrative operational calculation, not statutory accounting."
      />
      <Card>
        <CardHeader title="Portfolio totals" />
        <FinanceSummaryCards totals={totalsList(portfolioFinance(data.rows))} />
      </Card>
      <Card>
        <CardHeader
          title="Per file"
          actions={
            <label className="flex items-center gap-2 text-sm">
              Sort
              <select value={sort} onChange={(e) => url.set({ sort: e.target.value === "contribution" ? null : e.target.value })} className="h-8 rounded-md border border-slate-300 px-2 text-sm">
                <option value="contribution">Lowest contribution first</option>
                <option value="unrecovered">Highest unrecovered first</option>
                <option value="reference">Reference</option>
              </select>
            </label>
          }
        />
        {lines.length === 0 ? (
          <EmptyState title="No financial records." />
        ) : (
          <TableWrap label="Per-file financial performance">
            <thead>
              <tr>
                <th className={th}>File</th>
                <th className={th}>Stage</th>
                <th className={th}>Service invoiced</th>
                <th className={th}>Own costs</th>
                <th className={th}>Contribution</th>
                <th className={th}>Margin</th>
                <th className={th}>Invoice outstanding</th>
                <th className={th}>Unrecovered disb.</th>
                <th className={th}>Client funds held</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ r, t }) => (
                <tr key={`${r.shipment.id}-${t.currency}`} data-testid="perf-row">
                  <td className={`${td} whitespace-nowrap`}>
                    <Link className="font-medium text-navy-700 hover:underline" href={`/management/shipments/${r.shipment.id}?tab=finance`}>
                      {r.shipment.reference}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {r.clientShortName} · {t.currency}
                    </span>
                  </td>
                  <td className={td}><StageBadge stage={r.shipment.stage} /></td>
                  <td className={td}><Money minor={t.serviceInvoiced} currency={t.currency} /></td>
                  <td className={td}><Money minor={t.operationalCosts} currency={t.currency} /></td>
                  <td className={`${td} ${t.contribution < 0 ? "text-red-700" : ""}`}><Money minor={t.contribution} currency={t.currency} /></td>
                  <td className={`${td} tabular`}>{formatBasisPoints(t.marginBp)}</td>
                  <td className={td}><Money minor={t.invoiceOutstanding} currency={t.currency} /></td>
                  <td className={`${td} ${t.unrecoveredDisbursements ? "font-medium text-red-700" : ""}`}><Money minor={t.unrecoveredDisbursements} currency={t.currency} /></td>
                  <td className={td}><Money minor={t.clientFundsHeld} currency={t.currency} /></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
