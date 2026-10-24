"use client";
import { Check } from "lucide-react";
import { STAGE_CLIENT_LABEL } from "@/domain/labels";
import { stageIndex } from "@/domain/rules";
import { STAGES, type Milestone, type Stage } from "@/domain/types";
import { cx, formatDate } from "../ui";

/** Client-friendly milestone tracker. Status is given in text as well as colour. */
export function ProgressTracker({ stage, milestones }: { stage: Stage; milestones: Milestone[] }) {
  const current = stageIndex(stage);
  const reachedAt = (s: Stage) => milestones.filter((m) => m.stage === s).at(-1)?.at;
  return (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Shipment progress" data-testid="progress-tracker">
      {STAGES.map((s, i) => {
        const done = i < current || (i === current && s === "closed");
        const isCurrent = i === current && s !== "closed";
        return (
          <li
            key={s}
            aria-current={isCurrent ? "step" : undefined}
            className={cx(
              "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs sm:flex-col sm:gap-1",
              done ? "border-emerald-200 bg-emerald-50" : isCurrent ? "border-navy-600 bg-white ring-1 ring-navy-600" : "border-slate-200 bg-slate-50 text-slate-500",
            )}
          >
            <span
              className={cx(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                done ? "bg-emerald-600 text-white" : isCurrent ? "bg-navy-900 text-white" : "bg-slate-200 text-slate-600",
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-slate-900">{STAGE_CLIENT_LABEL[s]}</span>
              <span className="block text-slate-500">
                {done ? `Done ${formatDate(reachedAt(s))}` : isCurrent ? `Current · since ${formatDate(reachedAt(s))}` : "Upcoming"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
