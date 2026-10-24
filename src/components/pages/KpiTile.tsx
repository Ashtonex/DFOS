"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../ui";

export function KpiTile({
  href,
  label,
  value,
  hint,
  tone = "neutral",
  testId,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "warning" | "danger";
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cx(
        "group block rounded-lg border bg-white px-4 py-3 transition-colors hover:border-navy-600",
        tone === "danger" ? "border-red-200" : tone === "warning" ? "border-amber-300" : "border-slate-200",
      )}
    >
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-slate-900" data-testid={testId ? `${testId}-value` : undefined}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500 group-hover:text-navy-700">{hint}</div>}
    </Link>
  );
}
