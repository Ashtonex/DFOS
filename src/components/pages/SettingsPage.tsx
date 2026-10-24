"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { qk, TOPICS } from "@/lib/queryKeys";
import { announceChange, invalidateTopics } from "@/lib/sync";
import { PERSONAS } from "@/lib/persona";
import { Alert, Button, Card, CardHeader, Modal, PageHeader, formatDateTime } from "../ui";

export function SettingsPage() {
  const qc = useQueryClient();
  const seed = useQuery({ queryKey: qk.seed(), queryFn: () => repo.getSeedInfo() });
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "pending" | "success" | "error"; message?: string }>({ kind: "idle" });

  const reset = async () => {
    setState({ kind: "pending" });
    try {
      await repo.resetDemoData();
      announceChange(TOPICS.reset);
      await invalidateTopics(qc, TOPICS.reset);
      setState({ kind: "success", message: "Demonstration data restored to its starting state." });
      setConfirming(false);
    } catch (e) {
      setState({ kind: "error", message: `Reset failed: ${errorMessage(e)}. Existing data was left unchanged.` });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings & demonstration data" />
      <Card>
        <CardHeader title="Demonstration data" description="Stored in this browser's IndexedDB for this site only." />
        <div className="space-y-3 p-4 text-sm">
          <p>
            Data seeded: <strong data-testid="seeded-at">{seed.data ? formatDateTime(seed.data.seededAt) : seed.isPending ? "…" : "unknown"}</strong> ·
            schema v{seed.data?.schemaVersion ?? "?"}
          </p>
          <p className="text-slate-600">
            Local demonstration data persists in this browser and origin. It is not shared between devices and is not a substitute for
            managed backups.
          </p>
          {state.kind === "success" && <Alert tone="success">{state.message}</Alert>}
          {state.kind === "error" && <Alert tone="danger">{state.message}</Alert>}
          <Button variant="danger" onClick={() => setConfirming(true)} data-testid="reset-demo">
            <RotateCcw className="size-4" aria-hidden /> Reset demonstration data
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Recovering a broken demo database" />
        <ol className="list-decimal space-y-1 p-4 pl-8 text-sm text-slate-700">
          <li>Try &ldquo;Reset demonstration data&rdquo; above. It clears and restores every record in one transaction.</li>
          <li>If this page cannot load, close other DFOS tabs, then open browser DevTools → Application → IndexedDB and delete the <code>dfos-demo</code> database.</li>
          <li>Reload DFOS. A fresh database is created and seeded automatically when none exists.</li>
        </ol>
      </Card>
      <Card>
        <CardHeader title="Demo personas" description="The persona switcher demonstrates experience and filtering. It is not production authentication or a security boundary." />
        <ul className="divide-y divide-slate-100 text-sm">
          {PERSONAS.map((p) => (
            <li key={p.id} className="px-4 py-2">
              <strong>{p.label}</strong> — {p.name}, {p.title}
            </li>
          ))}
        </ul>
      </Card>
      <Modal
        open={confirming}
        onClose={() => state.kind !== "pending" && setConfirming(false)}
        title="Reset demonstration data?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={state.kind === "pending"}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reset} pending={state.kind === "pending"} data-testid="confirm-reset">
              Reset all data
            </Button>
          </>
        }
      >
        <p className="text-sm">
          This permanently replaces every shipment, document, payment and activity record in this browser with the original
          demonstration data, including the guided demo shipment if you created one. Other open DFOS tabs will refresh.
        </p>
      </Modal>
    </div>
  );
}
