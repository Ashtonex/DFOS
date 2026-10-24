"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { FileText, Package, Search, X } from "lucide-react";
import { useSearch, useViewer } from "@/lib/hooks";
import { shipmentHref } from "@/lib/links";
import { cx } from "../ui";

export function GlobalSearch({ compact }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const deferred = useDeferredValue(q);
  const { data, isFetching } = useSearch(deferred);
  const { persona } = useViewer();
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = data ?? [];
  const href = (r: (typeof results)[number]) =>
    persona ? shipmentHref(persona, r.shipmentId, r.kind === "document" ? "documents" : undefined) : "#";
  const close = () => {
    setOpen(false);
    setQ("");
    setExpanded(false);
  };

  if (compact && !expanded)
    return (
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => input.current?.focus(), 0);
        }}
        className="rounded p-1.5 text-slate-200 hover:bg-white/10"
      >
        <Search className="size-5" aria-hidden />
      </button>
    );

  return (
    <div
      ref={box}
      className={cx(
        "relative",
        compact ? "fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 bg-navy-950 px-3" : "w-full max-w-md",
      )}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search shipments and documents
      </label>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          ref={input}
          id={`${listId}-input`}
          data-testid="global-search"
          role="combobox"
          aria-expanded={open && q.length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search reference, client, description, document…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "Enter" && results[0]) {
              router.push(href(results[0]));
              close();
            }
          }}
          className="h-9 w-full rounded-md border border-white/15 bg-navy-800 pr-3 pl-8 text-sm text-white placeholder:text-slate-400"
        />
      </div>
      {compact && (
        <button type="button" onClick={close} aria-label="Close search" className="rounded p-1.5 text-slate-200 hover:bg-white/10">
          <X className="size-5" aria-hidden />
        </button>
      )}
      {open && q.trim().length >= 2 && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className={cx(
            "absolute z-40 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-slate-900 shadow-lg",
            compact ? "top-14 right-3 left-3" : "top-full right-0 left-0",
          )}
        >
          {results.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">{isFetching ? "Searching…" : "No matching shipments or documents."}</p>
          )}
          {results.map((r) => (
            <Link
              key={`${r.kind}-${r.id}`}
              role="option"
              aria-selected={false}
              href={href(r)}
              onClick={close}
              className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50"
            >
              {r.kind === "shipment" ? <Package className="mt-0.5 size-4 text-slate-400" aria-hidden /> : <FileText className="mt-0.5 size-4 text-slate-400" aria-hidden />}
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.title}</span>
                <span className="block truncate text-xs text-slate-500">{r.subtitle}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
