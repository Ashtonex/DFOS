"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import * as repo from "@/data/repository";
import { PERSONAS, setPersonaId } from "@/lib/persona";
import { Alert, Card, CardHeader, ErrorState, LoadingBlock, PageHeader, cx } from "../ui";

interface Step {
  key: string;
  persona: string;
  title: string;
  how: string;
  href: (id: string | null) => string;
}

const STEPS: Step[] = [
  { key: "request", persona: "client-ehis", title: "Client submits the shipment request", how: "New request → “Fill guided demo values” → Submit. DFOS lists the five documents required for an import.", href: () => "/client/shipments/new" },
  { key: "assign", persona: "ops", title: "Operations sees the request and assigns an officer", how: "Dashboard → Unassigned requests → open DF-DEMO-2026-001 → Assigned officer → Tendai Moyo.", href: (id) => (id ? `/operations/shipments/${id}` : "/operations/shipments?kpi=unassigned") },
  { key: "preparation", persona: "ops", title: "Identify outstanding documents", how: "Next step → Move to Preparation. The Documents tab shows all five requirements as Missing.", href: (id) => `/operations/shipments/${id}?tab=documents` },
  { key: "clientUpload", persona: "client-ehis", title: "Client uploads the missing documents", how: "Client portal → shipment → Documents → Upload each (any PDF/PNG/JPEG/TXT under 5 MB).", href: (id) => `/client/shipments/${id}?tab=documents` },
  { key: "review", persona: "ops", title: "Operations accepts or rejects", how: "Reject one with a reason to show history, have the client re-upload, then accept all. Readiness becomes complete.", href: (id) => `/operations/shipments/${id}?tab=documents` },
  { key: "submitted", persona: "ops", title: "Record the customs submission reference", how: "Overview → Next step → Ready for submission, then Submitted with a reference (manually recorded, not integrated).", href: (id) => `/operations/shipments/${id}` },
  { key: "delay", persona: "ops", title: "Record an external processing delay", how: "Tasks & exceptions → Record exception → External processing delay, with owner, next action and follow-up date.", href: (id) => `/operations/shipments/${id}?tab=tasks` },
  { key: "management", persona: "mgmt", title: "Management sees the exception and follow-up", how: "Management → Exceptions → External delays. The dashboard figure links to the same files.", href: () => "/management/exceptions?filter=external_delay" },
  { key: "funding", persona: "ops", title: "Raise a client funding request", how: "Finance → Request funding (e.g. Customs duty and VAT, USD 2,500.00).", href: (id) => `/operations/shipments/${id}?tab=finance` },
  { key: "notify", persona: "client-ehis", title: "Client views it and notifies payment", how: "Funding & payments → Notify payment. It stays “Awaiting verification” and is not counted as funds.", href: (id) => `/client/shipments/${id}?tab=payments` },
  { key: "verify", persona: "ops", title: "Operations verifies the actual receipt", how: "Finance → Verify receipt: record the amount that arrived and the bank reference.", href: (id) => `/operations/shipments/${id}?tab=finance` },
  { key: "disburse", persona: "ops", title: "Record the disbursement", how: "Finance → Record disbursement (within available client funds).", href: (id) => `/operations/shipments/${id}?tab=finance` },
  { key: "released", persona: "ops", title: "Attach release evidence and mark Released", how: "Documents → Stage evidence → Attach release evidence, then Overview → Move to Released.", href: (id) => `/operations/shipments/${id}?tab=documents` },
  { key: "delivered", persona: "ops", title: "Attach proof of delivery and mark Delivered", how: "Move to In delivery, attach proof of delivery, then Move to Delivered.", href: (id) => `/operations/shipments/${id}?tab=documents` },
  { key: "invoice", persona: "ops", title: "Review the invoice and financial summary", how: "Finance → Add service line → Issue invoice. Client notifies payment; Operations verifies it.", href: (id) => `/operations/shipments/${id}?tab=finance` },
  { key: "closed", persona: "ops", title: "Close the file once closure requirements are met", how: "Resolve the exception, then Overview → Move to Closed. Any unmet criterion is listed as a blocker.", href: (id) => `/operations/shipments/${id}` },
];

export function GuidePage() {
  const router = useRouter();
  const status = useQuery({ queryKey: ["workspace", "guide"], queryFn: () => repo.getGuideStatus() });
  if (status.isPending) return <LoadingBlock rows={6} />;
  if (status.error) return <ErrorState error={status.error} onRetry={() => status.refetch()} />;
  const { shipmentId, done } = status.data;
  const nextKey = STEPS.find((s) => !done[s.key])?.key;
  const go = (step: Step) => {
    setPersonaId(step.persona);
    router.push(step.href(shipmentId));
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Guided demonstration · DF-DEMO-2026-001"
        subtitle="Fictional import of machinery spare parts for Eastern Highlands Industrial Supplies: Durban → Beitbridge → Mutare. Ticks are derived from the stored records."
      />
      <Alert tone="info">
        To repeat the scenario, use <Link href="/settings" className="font-medium underline">Settings → Reset demonstration data</Link>. External statuses in this
        scenario are manually recorded or simulated. DFOS does not process payments or connect to customs systems.
      </Alert>
      <Card className="mt-4">
        <CardHeader title="Steps" description="“Go” switches to the right persona and opens the right screen." />
        <ol className="divide-y divide-slate-100" data-testid="guide-steps">
          {STEPS.map((step, i) => {
            const isDone = !!done[step.key];
            const isNext = step.key === nextKey;
            const persona = PERSONAS.find((p) => p.id === step.persona)!;
            const blocked = !shipmentId && step.key !== "request";
            return (
              <li key={step.key} className={cx("flex flex-wrap items-start gap-3 px-4 py-3", isNext && "bg-accent-50")} data-testid={`guide-step-${step.key}`} data-done={isDone}>
                {isDone ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-label="Not done" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {i + 1}. {step.title}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{step.how}</p>
                  <p className="mt-0.5 text-xs text-slate-500">As: {persona.label} ({persona.name})</p>
                </div>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => go(step)}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
                    isNext ? "bg-navy-900 text-white hover:bg-navy-800" : "border border-slate-300 bg-white hover:bg-slate-50",
                  )}
                >
                  Go
                </button>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
