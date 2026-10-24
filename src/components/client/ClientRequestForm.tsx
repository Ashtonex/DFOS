"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import * as repo from "@/data/repository";
import { DomainError, errorMessage } from "@/data/errors";
import { CATEGORY_LABEL, MODE_LABEL } from "@/domain/labels";
import { SHIPMENT_CATEGORIES, TRANSPORT_MODES, type ShipmentCategory, type TransportMode } from "@/domain/types";
import { REQUIRED_DOCS_BY_CATEGORY, addDaysISO, todayISO } from "@/domain/rules";
import { useDfosMutation, useOpId, useUnsavedChangesGuard, useViewer } from "@/lib/hooks";
import { TOPICS } from "@/lib/queryKeys";
import { useToast } from "../toast";
import { Alert, Button, Card, CardHeader, PageHeader, SelectField, TextField } from "../ui";

const EMPTY = {
  description: "",
  category: "import" as ShipmentCategory,
  mode: "road" as TransportMode,
  origin: "",
  destination: "",
  borderPost: "",
  expectedArrival: "",
  clientReference: "",
};

export const GUIDED_VALUES = {
  description: "Machinery spare parts",
  category: "import" as ShipmentCategory,
  mode: "road" as TransportMode,
  origin: "Durban",
  destination: "Mutare",
  borderPost: "Beitbridge",
  clientReference: "EH-PO-8120",
};

export function ClientRequestForm() {
  const { persona } = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(EMPTY);
  const [guided, setGuided] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [opId, renewOpId] = useOpId();
  const [submitted, setSubmitted] = useState(false);
  const dirty = !submitted && JSON.stringify(v) !== JSON.stringify(EMPTY);
  useUnsavedChangesGuard(dirty);
  const isGuidedClient = persona?.clientId === "c-ehis";

  const create = useDfosMutation({
    mutationFn: (p, input: typeof EMPTY & { guidedDemo: boolean }) => repo.createShipmentRequest(p.userId, input, opId),
    topics: TOPICS.shipmentRecord,
  });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setV((x) => ({ ...x, [k]: value }));
    setErrors((prev) => {
      if (!prev[k]) return prev;
      const n = { ...prev };
      delete n[k];
      return n;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    setFormError(null);
    try {
      const res = await create.mutateAsync({ ...v, guidedDemo: guided });
      setSubmitted(true);
      renewOpId();
      toast("success", `Request ${res.reference} submitted to Divine Freight.`);
      router.push(`/client/shipments/${res.shipmentId}?tab=documents`);
    } catch (err) {
      if (err instanceof DomainError && err.fieldErrors) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New shipment request" subtitle="Tell Divine Freight about a consignment. You will see exactly which documents are needed next." />
      {isGuidedClient && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-accent-100 bg-accent-50 px-3 py-2 text-sm">
          <Sparkles className="size-4 text-accent-700" aria-hidden />
          <span className="flex-1">Guided demonstration: fill in the fictional DF-DEMO-2026-001 import (Durban → Beitbridge → Mutare).</span>
          <Button
            size="sm"
            variant="secondary"
            data-testid="fill-guided"
            onClick={() => {
              setV({ ...GUIDED_VALUES, expectedArrival: addDaysISO(todayISO(), 7) });
              setGuided(true);
            }}
          >
            Fill guided demo values
          </Button>
        </div>
      )}
      <Card>
        <CardHeader title="Consignment" />
        <form onSubmit={submit} noValidate className="space-y-4 p-4" data-testid="request-form">
          {formError && (
            <Alert tone="danger">
              {formError}{" "}
              {formError.includes("guided demo shipment already exists") && (
                <Link className="underline" href="/guide">
                  Open the demo guide
                </Link>
              )}
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="Goods description" required value={v.description} onChange={set("description")} error={errors.description} />
            </div>
            <SelectField
              label="Category"
              value={v.category}
              onChange={set("category")}
              options={SHIPMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
            />
            <SelectField label="Transport mode" value={v.mode} onChange={set("mode")} options={TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
            <TextField label="Origin" required value={v.origin} onChange={set("origin")} error={errors.origin} />
            <TextField label="Destination" required value={v.destination} onChange={set("destination")} error={errors.destination} />
            <TextField label="Border / processing location" required value={v.borderPost} onChange={set("borderPost")} error={errors.borderPost} />
            <TextField label="Expected arrival" type="date" value={v.expectedArrival} onChange={set("expectedArrival")} error={errors.expectedArrival} />
            <TextField label="Your order / PO reference" value={v.clientReference} onChange={set("clientReference")} error={errors.clientReference} />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-medium">Documents you will be asked for ({CATEGORY_LABEL[v.category].toLowerCase()})</div>
            <ul className="mt-1 list-disc pl-5 text-slate-700">
              {REQUIRED_DOCS_BY_CATEGORY[v.category].map((r) => (
                <li key={r.docType}>{r.label}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">Prototype document rules pending confirmation by Divine Freight.</p>
          </div>
          <Button type="submit" pending={create.isPending} data-testid="submit-request">
            Submit request
          </Button>
        </form>
      </Card>
    </div>
  );
}
