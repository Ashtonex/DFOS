"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { kpiRows, portfolioFinance } from "@/domain/derive";
import { totalsList, fundingRequestStatus } from "@/domain/finance";
import { isOverdue } from "@/domain/rules";
import { useAction, useViewer, useWorkspace } from "@/lib/hooks";
import { canWrite, type Workspace } from "@/lib/persona";
import { shipmentHref } from "@/lib/links";
import { TOPICS } from "@/lib/queryKeys";
import { useUrlState } from "@/lib/useUrlState";
import { ExceptionItem } from "../shipments/TasksExceptionsTab";
import { FinanceSummaryCards } from "../shipments/FinanceTab";
import { NotificationStatus } from "../client/ClientPayments";
import { FundingBadge, Money } from "../status";
import { useToast } from "../toast";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, TableWrap, cx, formatDate, td, th } from "../ui";

function FilterTabs({ options, value, onChange, label }: { options: [string, string, number?][]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map(([k, text, count]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cx("rounded-md px-3 py-1.5 text-sm", value === k ? "bg-navy-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50")}
        >
          {text}
          {count !== undefined && <span className="tabular ml-1.5 opacity-80">({count})</span>}
        </button>
      ))}
    </div>
  );
}

export function ExceptionsPage({ workspace }: { workspace: Exclude<Workspace, "client"> }) {
  const { data, error, isPending, refetch } = useWorkspace();
  const url = useUrlState();
  const filter = url.get("filter", "open");
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const ref = new Map(s.shipments.map((x) => [x.id, x.reference]));
  const open = s.exceptions.filter((e) => e.status === "open");
  const sets: Record<string, typeof s.exceptions> = {
    open,
    external_delay: open.filter((e) => e.category === "external_delay"),
    overdue: open.filter((e) => isOverdue(e.followUpDate, data.today)),
    resolved: s.exceptions.filter((e) => e.status === "resolved"),
  };
  const list = (sets[filter] ?? open).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  const overdueTasks = s.tasks.filter((t) => t.status === "open" && isOverdue(t.dueDate, data.today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <div className="space-y-4">
      <PageHeader
        title={workspace === "management" ? "Exceptions & overdue follow-ups" : "Exceptions & follow-up"}
        subtitle="External statuses are manually recorded by Divine Freight staff. DFOS does not integrate with customs."
      />
      <FilterTabs
        label="Exception filter"
        value={filter}
        onChange={(v) => url.set({ filter: v === "open" ? null : v })}
        options={[
          ["open", "All open", sets.open.length],
          ["external_delay", "External delays", sets.external_delay.length],
          ["overdue", "Follow-up overdue", sets.overdue.length],
          ["resolved", "Resolved", sets.resolved.length],
        ]}
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState title="No exceptions in this view." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="exceptions-list">
            {list.map((e) => (
              <ExceptionItem
                key={e.id}
                e={e}
                users={s.users}
                showShipment={
                  <Link href={shipmentHref(workspace, e.shipmentId, "tasks")} className="font-medium text-navy-700 hover:underline">
                    {ref.get(e.shipmentId)}
                  </Link>
                }
              />
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title={`Overdue follow-up tasks (${overdueTasks.length})`} />
        {overdueTasks.length === 0 ? (
          <EmptyState title="No overdue follow-ups." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="overdue-tasks">
            {overdueTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <Link href={shipmentHref(workspace, t.shipmentId, "tasks")} className="font-medium text-navy-700 hover:underline">
                  {ref.get(t.shipmentId)}
                </Link>
                <span className="min-w-0 flex-1">{t.title}</span>
                <span className="text-slate-600">{s.users.find((u) => u.id === t.assigneeId)?.name}</span>
                <Badge tone="danger">Due {formatDate(t.dueDate)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function TasksPage() {
  const { persona } = useViewer();
  const { data, error, isPending, refetch } = useWorkspace();
  const toast = useToast();
  const url = useUrlState();
  const filter = url.get("filter", "open");
  const complete = useAction((u, id: string) => repo.completeTask(u, id), TOPICS.workflow);
  if (isPending) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const ref = new Map(s.shipments.map((x) => [x.id, x.reference]));
  const openTasks = s.tasks.filter((t) => t.status === "open");
  const sets: Record<string, typeof s.tasks> = {
    open: openTasks,
    overdue: openTasks.filter((t) => isOverdue(t.dueDate, data.today)),
    mine: openTasks.filter((t) => t.assigneeId === persona?.userId),
    done: s.tasks.filter((t) => t.status === "done"),
  };
  const list = [...(sets[filter] ?? openTasks)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Assigned follow-ups across all files." />
      <FilterTabs
        label="Task filter"
        value={filter}
        onChange={(v) => url.set({ filter: v === "open" ? null : v })}
        options={[
          ["open", "All open", sets.open.length],
          ["overdue", "Overdue", sets.overdue.length],
          ["mine", "Assigned to me", sets.mine.length],
          ["done", "Completed", sets.done.length],
        ]}
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState title="No tasks in this view." />
        ) : (
          <TableWrap label="Tasks">
            <thead>
              <tr>
                <th className={th}>Shipment</th>
                <th className={th}>Task</th>
                <th className={th}>Assignee</th>
                <th className={th}>Due</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} data-testid="task-row">
                  <td className={`${td} whitespace-nowrap`}>
                    <Link className="font-medium text-navy-700 hover:underline" href={shipmentHref("operations", t.shipmentId, "tasks")}>
                      {ref.get(t.shipmentId)}
                    </Link>
                  </td>
                  <td className={td}>
                    {t.title}
                    {t.exceptionId && <span className="block text-xs text-slate-500">Closes when its exception is resolved</span>}
                  </td>
                  <td className={td}>{s.users.find((u) => u.id === t.assigneeId)?.name}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatDate(t.dueDate)} {t.status === "open" && isOverdue(t.dueDate, data.today) && <Badge tone="danger">Overdue</Badge>}
                  </td>
                  <td className={td}>
                    {t.status === "open" && !t.exceptionId && canWrite(persona) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        pending={complete.isPending && complete.variables === t.id}
                        onClick={() => complete.mutateAsync(t.id).then(() => toast("success", "Task completed."), (e) => toast("danger", errorMessage(e)))}
                      >
                        <Check className="size-3.5" aria-hidden /> Complete
                      </Button>
                    )}
                    {t.status === "done" && <Badge tone="success">Done</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

export function OpsFinancePage() {
  const { data, error, isPending, refetch } = useWorkspace();
  if (isPending) return <LoadingBlock rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const s = data.snapshot;
  const ref = new Map(s.shipments.map((x) => [x.id, x]));
  const pending = s.notifications.filter((n) => n.status === "notified").sort((a, b) => a.notifiedAt.localeCompare(b.notifiedAt));
  const awaiting = s.fundingRequests
    .map((f) => ({ f, st: fundingRequestStatus(f, s.receipts, s.notifications) }))
    .filter(({ f, st }) => ref.get(f.shipmentId)?.stage !== "closed" && (st === "awaiting_payment" || st === "partially_funded" || st === "payment_notified"))
    .sort((a, b) => a.f.dueDate.localeCompare(b.f.dueDate));
  const unrecovered = kpiRows(data.rows, "unrecovered");
  const held = data.rows.filter((r) => r.shipment.stage !== "closed" && totalsList(r.finance).some((t) => t.clientFundsHeld > 0));
  return (
    <div className="space-y-4">
      <PageHeader title="Funding & finance" subtitle="Verify client payments, chase funding and control disbursements. Open a file's Finance tab to act." />
      <Card>
        <CardHeader title={`Payment notifications to verify (${pending.length})`} description="Client claims of payment. Not available funds until verified." />
        {pending.length === 0 ? (
          <EmptyState title="Nothing to verify." />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="to-verify">
            {pending.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <Link href={shipmentHref("operations", n.shipmentId, "finance")} className="font-medium text-navy-700 hover:underline">
                  {ref.get(n.shipmentId)?.reference}
                </Link>
                <Money minor={n.amount} currency={n.currency} />
                <span className="text-slate-600">ref {n.payerReference} · paid {formatDate(n.paidOn)}</span>
                <NotificationStatus n={n} />
                <LinkButton href={shipmentHref("operations", n.shipmentId, "finance")} size="sm" variant="primary" className="ml-auto">
                  Verify
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title={`Funding awaited from clients (${awaiting.length})`} />
        {awaiting.length === 0 ? (
          <EmptyState title="No funding outstanding." />
        ) : (
          <TableWrap label="Funding awaited">
            <thead>
              <tr>
                <th className={th}>Shipment</th>
                <th className={th}>Purpose</th>
                <th className={th}>Amount</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {awaiting.map(({ f, st }) => (
                <tr key={f.id}>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={shipmentHref("operations", f.shipmentId, "finance")} className="font-medium text-navy-700 hover:underline">
                      {ref.get(f.shipmentId)?.reference}
                    </Link>
                  </td>
                  <td className={td}>{f.purpose}</td>
                  <td className={td}><Money minor={f.amount} currency={f.currency} /></td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatDate(f.dueDate)} {isOverdue(f.dueDate, data.today) && <Badge tone="danger">Overdue</Badge>}
                  </td>
                  <td className={td}><FundingBadge status={st} /></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Unrecovered disbursements (${unrecovered.length} files)`} />
          {unrecovered.length === 0 ? (
            <EmptyState title="None." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {unrecovered.map((r) => (
                <li key={r.shipment.id} className="flex justify-between px-4 py-2">
                  <Link href={shipmentHref("operations", r.shipment.id, "finance")} className="font-medium text-navy-700 hover:underline">
                    {r.shipment.reference}
                  </Link>
                  <span>
                    {totalsList(r.finance)
                      .filter((t) => t.unrecoveredDisbursements > 0)
                      .map((t) => <Money key={t.currency} minor={t.unrecoveredDisbursements} currency={t.currency} className="text-red-700" />)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={`Client funds held on active files (${held.length})`} />
          {held.length === 0 ? (
            <EmptyState title="No client funds held." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {held.map((r) => (
                <li key={r.shipment.id} className="flex justify-between px-4 py-2">
                  <Link href={shipmentHref("operations", r.shipment.id, "finance")} className="font-medium text-navy-700 hover:underline">
                    {r.shipment.reference}
                  </Link>
                  <span>
                    {totalsList(r.finance)
                      .filter((t) => t.clientFundsHeld > 0)
                      .map((t) => <Money key={t.currency} minor={t.clientFundsHeld} currency={t.currency} />)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Portfolio totals (all files)" description="Per-file figures added up within each currency." />
        <FinanceSummaryCards totals={totalsList(portfolioFinance(data.rows))} />
      </Card>
    </div>
  );
}
