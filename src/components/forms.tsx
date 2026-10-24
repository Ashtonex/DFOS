"use client";
// Small helpers for the contextual action dialogs (record exception, verify receipt, ...).
import { useState, type ReactNode } from "react";
import { DomainError, errorMessage } from "@/data/errors";
import { parseMoney } from "@/domain/money";
import { useOpId } from "@/lib/hooks";
import { useToast } from "./toast";
import { Alert, Button, Modal } from "./ui";

export type FieldErrors = Record<string, string>;

/**
 * Generic dialog form: owns field errors, a form-level error, the idempotency
 * key and pending state. `run` throws DomainError/ValidationError on failure.
 */
export function ActionDialog<T>({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  render,
  run,
  success,
  danger,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  submitLabel: string;
  initial: T;
  render: (v: T, set: (patch: Partial<T>) => void, errors: FieldErrors) => ReactNode;
  run: (v: T, opId: string) => Promise<unknown>;
  success: string;
  danger?: boolean;
  testId?: string;
}) {
  const toast = useToast();
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [opId, renewOpId] = useOpId();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(initial);
      setErrors({});
      setFormError(null);
    }
  }
  const set = (patch: Partial<T>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setFormError(null);
    try {
      await run(values, opId);
      renewOpId();
      toast("success", success);
      onClose();
    } catch (err) {
      if (err instanceof DomainError && err.fieldErrors) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  const formId = `form-${testId ?? "action"}`;
  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant={danger ? "danger" : "primary"} pending={pending} data-testid={testId ? `${testId}-submit` : undefined}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-3" data-testid={testId}>
        {formError && <Alert tone="danger">{formError}</Alert>}
        {render(values, set, errors)}
      </form>
    </Modal>
  );
}

/** Parses a major-unit amount string, throwing a field error the dialog can display. */
export function requireAmount(input: string, field = "amount"): number {
  const r = parseMoney(input);
  if (!r.ok) throw new DomainError("validation", r.error, { [field]: r.error });
  return r.minor;
}
