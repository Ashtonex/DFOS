"use client";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { EXCEPTION_CATEGORY_LABEL } from "@/domain/labels";
import { addDaysISO, isOverdue, todayISO } from "@/domain/rules";
import { EXCEPTION_CATEGORIES, type ExceptionCategory, type ShipmentException, type User } from "@/domain/types";
import type { ShipmentDetail } from "@/data/repository";
import { useAction, useViewer } from "@/lib/hooks";
import { canWrite } from "@/lib/persona";
import { TOPICS } from "@/lib/queryKeys";
import { ActionDialog } from "../forms";
import { SourceBadge } from "../status";
import { useToast } from "../toast";
import { Badge, Button, Card, CardHeader, EmptyState, SelectField, TextAreaField, TextField, formatDate } from "../ui";

export const staffOptions = (users: User[]) =>
  users.filter((u) => ["officer", "operations_supervisor", "finance"].includes(u.role)).map((u) => ({ value: u.id, label: `${u.name} (${u.title})` }));

export function ExceptionItem({ e, users, onResolve, showShipment }: { e: ShipmentException; users: User[]; onResolve?: () => void; showShipment?: React.ReactNode }) {
  const overdue = e.status === "open" && isOverdue(e.followUpDate, todayISO());
  return (
    <li className="px-4 py-3 text-sm" data-testid="exception-item">
      <div className="flex flex-wrap items-center gap-2">
        {showShipment}
        <Badge tone={e.category === "external_delay" ? "danger" : "warning"}>{EXCEPTION_CATEGORY_LABEL[e.category]}</Badge>
        {e.status === "open" ? <Badge tone="warning">Open</Badge> : <Badge tone="success">Resolved</Badge>}
        <SourceBadge source={e.statusSource} />
        {overdue && <Badge tone="danger">Follow-up overdue</Badge>}
        {onResolve && e.status === "open" && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onResolve} data-testid="resolve-exception">
            Resolve
          </Button>
        )}
      </div>
      <p className="mt-1.5 font-medium text-slate-900">{e.description}</p>
      <p className="mt-0.5 text-slate-600">
        {e.authority && <>Authority: {e.authority} · </>}Owner: {users.find((u) => u.id === e.ownerId)?.name ?? "—"} · Next: {e.nextAction} · Follow up{" "}
        <span className={overdue ? "font-semibold text-red-700" : ""}>{formatDate(e.followUpDate)}</span>
      </p>
      {e.resolution && <p className="mt-0.5 text-emerald-800">Resolved {formatDate(e.resolvedAt)}: {e.resolution}</p>}
    </li>
  );
}

export function TasksExceptionsTab({ d }: { d: ShipmentDetail }) {
  const { persona } = useViewer();
  const toast = useToast();
  const sid = d.shipment.id;
  const writable = canWrite(persona) && d.shipment.stage !== "closed";
  const [dialog, setDialog] = useState<null | { kind: "exception" } | { kind: "resolve"; e: ShipmentException } | { kind: "task" }>(null);
  const close = () => setDialog(null);
  const record = useAction((u, a: { input: repo.ExceptionInput; opId: string }) => repo.recordException(u, a.input, a.opId), TOPICS.workflow, sid);
  const resolve = useAction((u, a: { id: string; resolution: string }) => repo.resolveException(u, a.id, a.resolution), TOPICS.workflow, sid);
  const createTask = useAction((u, a: { input: repo.TaskInput; opId: string }) => repo.createTask(u, a.input, a.opId), TOPICS.workflow, sid);
  const complete = useAction((u, id: string) => repo.completeTask(u, id), TOPICS.workflow, sid);
  const today = todayISO();
  const nameOf = (id: string) => d.users.find((u) => u.id === id)?.name ?? "—";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Exceptions"
          description="External delays and other issues, each with an owner, next action and follow-up date."
          actions={
            writable && (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "exception" })} data-testid="record-exception">
                <Plus className="size-3.5" aria-hidden /> Record exception
              </Button>
            )
          }
        />
        {d.exceptions.length === 0 ? (
          <EmptyState title="No exceptions recorded." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.exceptions.map((e) => (
              <ExceptionItem key={e.id} e={e} users={d.users} onResolve={writable ? () => setDialog({ kind: "resolve", e }) : undefined} />
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Tasks"
          description="Open blocking tasks prevent closure."
          actions={
            writable && (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "task" })} data-testid="add-task">
                <Plus className="size-3.5" aria-hidden /> Add task
              </Button>
            )
          }
        />
        {d.tasks.length === 0 ? (
          <EmptyState title="No tasks." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm" data-testid="task-item">
                <span className={`min-w-0 flex-1 ${t.status === "done" ? "text-slate-400 line-through" : ""}`}>
                  {t.title}
                  <span className="block text-xs text-slate-500 no-underline">
                    {nameOf(t.assigneeId)} · due {formatDate(t.dueDate)}
                    {t.blocking && " · blocks closure"}
                    {t.exceptionId && " · exception follow-up"}
                  </span>
                </span>
                {t.status === "open" && isOverdue(t.dueDate, today) && <Badge tone="danger">Overdue</Badge>}
                {t.status === "done" ? (
                  <Badge tone="success">Done</Badge>
                ) : (
                  writable &&
                  !t.exceptionId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      pending={complete.isPending && complete.variables === t.id}
                      onClick={() => complete.mutateAsync(t.id).then(() => toast("success", "Task completed."), (e) => toast("danger", errorMessage(e)))}
                    >
                      <Check className="size-3.5" aria-hidden /> Complete
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ActionDialog
        open={dialog?.kind === "exception"}
        onClose={close}
        title="Record exception"
        submitLabel="Record exception"
        testId="exception-form"
        initial={{
          category: "external_delay" as ExceptionCategory,
          authority: "",
          description: "",
          ownerId: d.shipment.assignedOfficerId ?? "",
          nextAction: "",
          followUpDate: addDaysISO(today, 1),
        }}
        success="Exception recorded with a follow-up task for the owner."
        run={(v, opId) => record.mutateAsync({ input: { shipmentId: sid, ...v }, opId })}
        render={(v, set, e) => (
          <>
            <SelectField
              label="Category"
              value={v.category}
              onChange={(x) => set({ category: x.target.value as ExceptionCategory })}
              options={EXCEPTION_CATEGORIES.map((c) => ({ value: c, label: EXCEPTION_CATEGORY_LABEL[c] }))}
            />
            <TextField
              label="External authority / party"
              hint="Manually recorded. DFOS does not integrate with or influence customs processing."
              value={v.authority}
              onChange={(x) => set({ authority: x.target.value })}
              error={e.authority}
              placeholder="e.g. Customs processing — Beitbridge"
            />
            <TextAreaField label="What happened" required value={v.description} onChange={(x) => set({ description: x.target.value })} error={e.description} data-testid="exception-description" />
            <SelectField label="Owner" required value={v.ownerId} onChange={(x) => set({ ownerId: x.target.value })} error={e.ownerId} options={[{ value: "", label: "— Choose owner —" }, ...staffOptions(d.users)]} />
            <TextField label="Next action" required value={v.nextAction} onChange={(x) => set({ nextAction: x.target.value })} error={e.nextAction} data-testid="exception-next" />
            <TextField label="Follow-up date" type="date" required value={v.followUpDate} onChange={(x) => set({ followUpDate: x.target.value })} error={e.followUpDate} />
          </>
        )}
      />
      {dialog?.kind === "resolve" && (
        <ActionDialog
          open
          onClose={close}
          title="Resolve exception"
          submitLabel="Resolve"
          testId="resolve-form"
          initial={{ resolution: "" }}
          success="Exception resolved and its follow-up closed."
          run={(v) => resolve.mutateAsync({ id: dialog.e.id, resolution: v.resolution })}
          render={(v, set, e) => (
            <TextAreaField label="How was it resolved?" required value={v.resolution} onChange={(x) => set({ resolution: x.target.value })} error={e.resolution} data-testid="resolution" />
          )}
        />
      )}
      <ActionDialog
        open={dialog?.kind === "task"}
        onClose={close}
        title="Add task"
        submitLabel="Add task"
        initial={{ title: "", assigneeId: d.shipment.assignedOfficerId ?? "", dueDate: addDaysISO(today, 1), blocking: true }}
        success="Task added."
        run={(v, opId) => createTask.mutateAsync({ input: { shipmentId: sid, ...v }, opId })}
        render={(v, set, e) => (
          <>
            <TextField label="Task" required value={v.title} onChange={(x) => set({ title: x.target.value })} error={e.title} />
            <SelectField label="Assignee" required value={v.assigneeId} onChange={(x) => set({ assigneeId: x.target.value })} error={e.assigneeId} options={[{ value: "", label: "— Choose —" }, ...staffOptions(d.users)]} />
            <TextField label="Due date" type="date" required value={v.dueDate} onChange={(x) => set({ dueDate: x.target.value })} error={e.dueDate} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.blocking} onChange={(x) => set({ blocking: x.target.checked })} /> Blocks closure until done
            </label>
          </>
        )}
      />
    </div>
  );
}
