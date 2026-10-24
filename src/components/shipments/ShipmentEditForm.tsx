"use client";
import { useState } from "react";
import { ConflictError, DomainError, errorMessage } from "@/data/errors";
import * as repo from "@/data/repository";
import { MODE_LABEL } from "@/domain/labels";
import { TRANSPORT_MODES, type Shipment, type TransportMode } from "@/domain/types";
import { useDfosMutation, useUnsavedChangesGuard } from "@/lib/hooks";
import { TOPICS } from "@/lib/queryKeys";
import { useToast } from "../toast";
import { Alert, Button, SelectField, TextAreaField, TextField } from "../ui";

type FormValues = {
  description: string;
  mode: string;
  origin: string;
  destination: string;
  borderPost: string;
  expectedArrival: string;
  expectedDelivery: string;
  clientReference: string;
  externalReference: string;
  internalNotes: string;
};

const toForm = (s: Shipment): FormValues => ({
  description: s.description,
  mode: s.mode,
  origin: s.origin,
  destination: s.destination,
  borderPost: s.borderPost,
  expectedArrival: s.expectedArrival ?? "",
  expectedDelivery: s.expectedDelivery ?? "",
  clientReference: s.clientReference ?? "",
  externalReference: s.externalReference ?? "",
  internalNotes: s.internalNotes,
});

const same = (a: FormValues, b: FormValues) => (Object.keys(a) as (keyof FormValues)[]).every((k) => a[k].trim() === b[k].trim());

/**
 * Local draft over the saved record. The draft only reconciles with newer saved
 * data deliberately: automatically when clean, or by the user when dirty.
 */
export function ShipmentEditForm({ shipment, onDone }: { shipment: Shipment; onDone: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<FormValues>(() => toForm(shipment));
  const [baseline, setBaseline] = useState<FormValues>(() => toForm(shipment));
  const [baseVersion, setBaseVersion] = useState(shipment.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = !same(draft, baseline);
  const stale = shipment.version !== baseVersion;

  if (stale && !dirty) {
    // Saved record changed (another tab/view) and there are no local edits: adopt it.
    setDraft(toForm(shipment));
    setBaseline(toForm(shipment));
    setBaseVersion(shipment.version);
  }

  useUnsavedChangesGuard(dirty);

  const save = useDfosMutation({
    mutationFn: (p, v: FormValues) => repo.updateShipment(p.userId, shipment.id, baseVersion, { ...v, mode: v.mode as TransportMode }),
    topics: TOPICS.shipmentRecord,
    shipmentId: () => shipment.id,
  });

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [k]: value }));
    setErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const loadLatest = () => {
    setDraft(toForm(shipment));
    setBaseline(toForm(shipment));
    setBaseVersion(shipment.version);
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    try {
      const res = await save.mutateAsync(draft);
      const saved = toForm(res.shipment);
      setDraft(saved);
      setBaseline(saved);
      setBaseVersion(res.shipment.version);
      toast("success", res.changed.length ? "Shipment details saved." : "No changes to save.");
      onDone();
    } catch (err) {
      if (err instanceof DomainError && err.fieldErrors) setErrors(err.fieldErrors);
      setFormError(err instanceof ConflictError ? `${err.message} Load the latest values, then re-apply your change.` : errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate data-testid="shipment-edit-form" className="space-y-4">
      {stale && dirty && (
        <Alert tone="warning" title="This file changed while you were editing">
          Another update was saved. Saving now will be rejected to avoid overwriting it.{" "}
          <button type="button" className="font-medium underline" onClick={loadLatest}>
            Discard my edits and load latest
          </button>
        </Alert>
      )}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField label="Goods description" name="description" required value={draft.description} onChange={set("description")} error={errors.description} />
        </div>
        <SelectField label="Transport mode" value={draft.mode} onChange={set("mode")} options={TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
        <TextField label="Border / processing location" required value={draft.borderPost} onChange={set("borderPost")} error={errors.borderPost} />
        <TextField label="Origin" required value={draft.origin} onChange={set("origin")} error={errors.origin} />
        <TextField label="Destination" required value={draft.destination} onChange={set("destination")} error={errors.destination} />
        <TextField label="Expected arrival" type="date" value={draft.expectedArrival} onChange={set("expectedArrival")} error={errors.expectedArrival} />
        <TextField label="Expected delivery" type="date" value={draft.expectedDelivery} onChange={set("expectedDelivery")} error={errors.expectedDelivery} />
        <TextField label="Client reference" value={draft.clientReference} onChange={set("clientReference")} error={errors.clientReference} />
        <TextField
          label="External / submission reference"
          hint="Manually recorded. Not an integrated customs status."
          value={draft.externalReference}
          onChange={set("externalReference")}
          error={errors.externalReference}
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label="Internal notes"
            hint="Visible to Divine Freight staff only. Never shown in the client portal."
            value={draft.internalNotes}
            onChange={set("internalNotes")}
            error={errors.internalNotes}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" pending={save.isPending} disabled={!dirty && !save.isPending} data-testid="save-shipment">
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (dirty && !window.confirm("Discard your unsaved changes?")) return;
            setDraft(baseline);
            onDone();
          }}
        >
          Cancel
        </Button>
        {dirty && <span className="text-xs text-amber-800">Unsaved changes</span>}
      </div>
    </form>
  );
}
