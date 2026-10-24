"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Wallet, X } from "lucide-react";
import { SHIPMENT_KPIS, isKpiKey, portfolioFinance, type ShipmentRow } from "@/domain/derive";
import { STAGE_LABEL } from "@/domain/labels";
import { stageIndex } from "@/domain/rules";
import { STAGES } from "@/domain/types";
import { totalsList } from "@/domain/finance";
import { useWorkspace } from "@/lib/hooks";
import { shipmentHref } from "@/lib/links";
import type { Workspace } from "@/lib/persona";
import { useUrlState } from "@/lib/useUrlState";
import { ReadinessBadge, StageBadge, Money } from "../status";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, TableWrap, formatDate, td, th } from "../ui";

const SORTS = {
  updated: { label: "Last updated", get: (r: ShipmentRow) => r.shipment.updatedAt },
  reference: { label: "Reference", get: (r: ShipmentRow) => r.shipment.reference },
  client: { label: "Client", get: (r: ShipmentRow) => r.clientName },
  stage: { label: "Stage", get: (r: ShipmentRow) => String(stageIndex(r.shipment.stage)).padStart(2, "0") },
  eta: { label: "Expected arrival", get: (r: ShipmentRow) => r.shipment.expectedArrival ?? "9999" },
} as const;
type SortKey = keyof typeof SORTS;
const PAGE_SIZE = 20;

export function matchesText(r: ShipmentRow, q: string) {
  if (!q) return true;
  const s = r.shipment;
  return [s.reference, s.description, r.clientName, s.externalReference, s.clientReference, s.origin, s.destination, s.borderPost, r.officerName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q.toLowerCase());
}

export function ShipmentListPage({ workspace }: { workspace: Exclude<Workspace, "client"> }) {
  const { data, error, isPending, refetch } = useWorkspace();
  const url = useUrlState();
  const q = url.get("q");
  const [text, setText] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    // URL changed externally (back/forward): reflect it in the input.
    setLastQ(q);
    setText(q);
  }
  useEffect(() => {
    if (text === q) return;
    // Debounce URL updates while typing (timed UI behaviour, not a race workaround).
    const t = setTimeout(() => url.set({ q: text, page: null }), 250);
    return () => clearTimeout(t);
  }, [text, q, url]);

  const stage = url.get("stage");
  const officer = url.get("officer");
  const client = url.get("client");
  const kpiParam = url.get("kpi");
  const kpi = isKpiKey(kpiParam) ? kpiParam : null;
  const sortParam = url.get("sort", "updated");
  const sort: SortKey = sortParam in SORTS ? (sortParam as SortKey) : "updated";
  const dir = url.get("dir", sort === "updated" ? "desc" : "asc") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(url.get("page", "1")) || 1);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data.rows.filter(
      (r) =>
        (!kpi || SHIPMENT_KPIS[kpi].test(r)) &&
        (!stage || r.shipment.stage === stage) &&
        (!officer || (officer === "none" ? !r.shipment.assignedOfficerId : r.shipment.assignedOfficerId === officer)) &&
        (!client || r.shipment.clientId === client) &&
        matchesText(r, q),
    );
    const get = SORTS[sort].get;
    rows.sort((a, b) => get(a).localeCompare(get(b)) * (dir === "asc" ? 1 : -1) || a.shipment.reference.localeCompare(b.shipment.reference));
    return rows;
  }, [data, kpi, stage, officer, client, q, sort, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const officers = data?.snapshot.users.filter((u) => u.role === "officer" || u.role === "operations_supervisor") ?? [];
  // Money KPIs show the amount behind each file plus a per-currency total that reconciles with the dashboard figure.
  const moneyCol = kpi === "unrecovered" ? ("unrecoveredDisbursements" as const) : kpi === "awaiting_funds" ? ("fundingOutstanding" as const) : null;
  const moneyTotals = moneyCol ? totalsList(portfolioFinance(filtered)).filter((t) => t[moneyCol] > 0) : [];

  const sortHeader = (key: SortKey, label: string) => {
    const active = sort === key;
    return (
      <th className={th} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className="inline-flex items-center gap-1 uppercase hover:text-slate-800"
          onClick={() => url.set({ sort: key, dir: active && dir === "asc" ? "desc" : "asc", page: null })}
        >
          {label}
          {active && (dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
        </button>
      </th>
    );
  };

  return (
    <div>
      <PageHeader
        title="Shipments"
        subtitle={workspace === "management" ? "Read-only management view of every file. Filters match the dashboard figures." : "All files across clients. Filters, sorting and paging are kept in the URL."}
      />
      {kpi && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-accent-100 bg-accent-50 px-3 py-2 text-sm" data-testid="kpi-filter">
          <span>
            Showing <strong>{SHIPMENT_KPIS[kpi].label}</strong>: {SHIPMENT_KPIS[kpi].description}.
          </span>
          <button type="button" onClick={() => url.set({ kpi: null, page: null })} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-accent-700 hover:bg-accent-100">
            <X className="size-3.5" aria-hidden /> Clear
          </button>
        </div>
      )}
      <Card>
        <div className="grid grid-cols-1 gap-2 border-b border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="ship-q" className="sr-only">
              Search shipments
            </label>
            <input
              id="ship-q"
              data-testid="list-search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search reference, client, description, route…"
              className="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
            />
          </div>
          <FilterSelect id="f-stage" label="Stage" value={stage} onChange={(v) => url.set({ stage: v, page: null })} options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
          <FilterSelect
            id="f-officer"
            label="Officer"
            value={officer}
            onChange={(v) => url.set({ officer: v, page: null })}
            options={[{ value: "none", label: "Unassigned" }, ...officers.map((o) => ({ value: o.id, label: o.name }))]}
          />
          <FilterSelect
            id="f-client"
            label="Client"
            value={client}
            onChange={(v) => url.set({ client: v, page: null })}
            options={(data?.snapshot.clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        {isPending ? (
          <div className="p-3">
            <LoadingBlock label="Loading shipments…" />
          </div>
        ) : error ? (
          <div className="p-3">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 px-3 py-2 text-xs text-slate-500" aria-live="polite">
              <span data-testid="result-count">
                {filtered.length} {filtered.length === 1 ? "file" : "files"}
              </span>
              {moneyTotals.map((t) => (
                <span key={t.currency} data-testid={`result-total-${t.currency}`}>
                  Total {t.currency}: <Money minor={t[moneyCol!]} currency={t.currency} className="font-semibold text-slate-800" />
                </span>
              ))}
            </div>
            {filtered.length === 0 ? (
              <EmptyState title="No shipments match these filters." />
            ) : (
              <TableWrap label="Shipments">
                <thead>
                  <tr>
                    {sortHeader("reference", "Reference")}
                    {sortHeader("client", "Client")}
                    <th className={th}>Goods / route</th>
                    {sortHeader("stage", "Stage")}
                    <th className={th}>Documents</th>
                    <th className={th}>Officer</th>
                    <th className={th}>{moneyCol === "unrecoveredDisbursements" ? "Unrecovered" : moneyCol ? "Funding outstanding" : "Attention"}</th>
                    {sortHeader("eta", "ETA")}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.shipment.id} className="hover:bg-slate-50" data-testid="shipment-row">
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={shipmentHref(workspace, r.shipment.id)} className="font-medium text-navy-700 underline-offset-2 hover:underline">
                          {r.shipment.reference}
                        </Link>
                      </td>
                      <td className={`${td} whitespace-nowrap`} title={r.clientName}>{r.clientShortName}</td>
                      <td className={`${td} max-w-xs`}>
                        <div className="truncate" data-testid="row-description">{r.shipment.description}</div>
                        <div className="truncate text-xs text-slate-500">
                          {r.shipment.origin} → {r.shipment.borderPost} → {r.shipment.destination}
                        </div>
                      </td>
                      <td className={td}>
                        <StageBadge stage={r.shipment.stage} />
                      </td>
                      <td className={td}>
                        <ReadinessBadge r={r.readiness} />
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{r.officerName ?? <Badge tone="warning">Unassigned</Badge>}</td>
                      <td className={td}>
                        {moneyCol ? (
                          totalsList(r.finance)
                            .filter((t) => t[moneyCol] > 0)
                            .map((t) => <Money key={t.currency} minor={t[moneyCol]} currency={t.currency} className="block" />)
                        ) : (
                          <AttentionFlags r={r} />
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(r.shipment.expectedArrival)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-between px-3 py-2 text-sm">
                <button type="button" disabled={page <= 1} onClick={() => url.set({ page: String(page - 1) })} className="rounded px-2 py-1 hover:bg-slate-100 disabled:text-slate-300">
                  Previous
                </button>
                <span>
                  Page {Math.min(page, pages)} of {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => url.set({ page: String(page + 1) })} className="rounded px-2 py-1 hover:bg-slate-100 disabled:text-slate-300">
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AttentionFlags({ r }: { r: ShipmentRow }) {
  const flags = [];
  if (r.openExternalDelays > 0)
    flags.push(
      <Badge key="d" tone="danger">
        <AlertTriangle className="size-3" aria-hidden /> External delay
      </Badge>,
    );
  else if (r.openExceptions > 0)
    flags.push(
      <Badge key="e" tone="warning">
        <AlertTriangle className="size-3" aria-hidden /> Exception
      </Badge>,
    );
  if (r.overdueTasks > 0)
    flags.push(
      <Badge key="o" tone="danger">
        <Clock className="size-3" aria-hidden /> {r.overdueTasks} overdue
      </Badge>,
    );
  if (r.shipment.stage !== "closed" && totalsList(r.finance).some((t) => t.fundingOutstanding > 0))
    flags.push(
      <Badge key="f" tone="warning">
        <Wallet className="size-3" aria-hidden /> Awaiting funds
      </Badge>,
    );
  if (r.pendingNotifications > 0) flags.push(<Badge key="p" tone="info">Payment to verify</Badge>);
  if (flags.length === 0) return <span className="text-xs text-slate-400">—</span>;
  return <div className="flex flex-wrap gap-1">{flags}</div>;
}
