"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useViewer, useWorkspace } from "@/lib/hooks";
import { kpiCounts } from "@/domain/derive";
import { fundingRequestStatus } from "@/domain/finance";
import { isOverdue, requirementViews } from "@/domain/rules";

interface Item {
  label: string;
  href: string;
  count: number;
}

/** Notifications are derived from stored records, never hardcoded. */
function useNotificationItems(): Item[] {
  const { persona } = useViewer();
  const { data } = useWorkspace();
  if (!persona || !data) return [];
  const { snapshot: s, rows, today } = data;
  if (persona.workspace === "client") {
    const active = new Set(rows.filter((r) => r.shipment.stage !== "closed").map((r) => r.shipment.id));
    const outstanding = requirementViews(
      s.requirements.filter((r) => active.has(r.shipmentId) && r.required),
      s.documents,
    ).filter((v) => v.state === "missing" || v.state === "rejected").length;
    const funding = s.fundingRequests.filter((f) => {
      const st = fundingRequestStatus(f, s.receipts, s.notifications);
      return st === "awaiting_payment" || st === "partially_funded";
    }).length;
    return [
      { label: "Documents to provide or resubmit", href: "/client/documents", count: outstanding },
      { label: "Funding requests awaiting payment", href: "/client/requests", count: funding },
    ];
  }
  const k = kpiCounts(rows);
  return [
    { label: "Documents awaiting review", href: "/operations/documents", count: s.documents.filter((d) => d.status === "pending_review").length },
    { label: "Payment notifications to verify", href: "/operations/finance", count: s.notifications.filter((n) => n.status === "notified").length },
    { label: "Overdue follow-up tasks", href: "/operations/tasks?filter=overdue", count: s.tasks.filter((t) => t.status === "open" && isOverdue(t.dueDate, today)).length },
    { label: "Unassigned requests", href: "/operations/shipments?kpi=unassigned", count: k.unassigned },
  ];
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const items = useNotificationItems();
  const total = items.reduce((s, i) => s + i.count, 0);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  return (
    <div ref={box} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Notifications${total ? `, ${total} items need attention` : ""}`}
        data-testid="notifications-button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded p-1.5 text-slate-200 hover:bg-white/10"
      >
        <Bell className="size-5" aria-hidden />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] leading-4 font-bold text-navy-950">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div id={id} className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-slate-200 bg-white py-1 text-slate-900 shadow-lg">
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">Needs attention</p>
          <ul>
            {items.map((i) => (
              <li key={i.label}>
                <Link href={i.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <span>{i.label}</span>
                  <span className={`tabular rounded px-1.5 text-xs font-semibold ${i.count ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500"}`}>{i.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
