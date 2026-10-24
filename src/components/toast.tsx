"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

interface Toast {
  id: number;
  tone: "success" | "danger";
  message: string;
}

const Ctx = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Toast["tone"], message: string) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, tone, message }]);
      // Success notices auto-dismiss (a genuinely timed UI behaviour); errors stay until dismissed.
      if (tone === "success") setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "danger" ? "alert" : "status"}
            data-testid="toast"
            className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg ${
              t.tone === "success" ? "border-emerald-200 bg-white text-emerald-900" : "border-red-200 bg-white text-red-900"
            }`}
          >
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 hover:bg-slate-100">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
