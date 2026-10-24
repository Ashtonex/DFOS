"use client";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variantClass: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 disabled:bg-slate-400",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:text-slate-400",
};
const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pending?: boolean; size?: "sm" | "md" }
>(function Button({ variant = "primary", pending, size = "md", className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cx(base, variantClass[variant], size === "sm" ? "h-8 px-2.5" : "h-9 px-3.5", className)}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(base, variantClass[variant], size === "sm" ? "h-8 px-2.5" : "h-9 px-3.5", className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ badges */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
const toneClass: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-300",
  danger: "bg-red-50 text-red-800 ring-red-200",
  accent: "bg-accent-50 text-accent-700 ring-accent-100",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ layout */

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={cx("rounded-lg border border-slate-200 bg-white", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, actions, description }: { title: ReactNode; actions?: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-slate-500">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 break-words">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function TableWrap({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="relative overflow-x-auto" role="region" aria-label={label} tabIndex={label ? 0 : undefined}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200";
export const td = "px-3 py-2.5 border-b border-slate-100 align-top";

/* ------------------------------------------------------------------ feedback */

export function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  const cls = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-300 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-2 rounded-md border px-3 py-2 text-sm", cls)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label="Dismiss">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 py-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-slate-200/70" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Alert tone="danger" title="Could not load this view">
      <p>{msg}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ form fields */

const inputCls =
  "block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 disabled:bg-slate-100 aria-[invalid=true]:border-red-500";

function FieldShell({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { label: ReactNode; error?: string; hint?: ReactNode };

export function TextField({ label, error, hint, id, required, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} required={required}>
      <input
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={inputCls}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, id, required, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={cx(inputCls, "min-h-20")}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  id,
  required,
  options,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} required={required}>
      <select
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={inputCls}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ dialog */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wraps Tab / Shift+Tab inside a dialog (native modal dialogs otherwise let focus leave to the browser UI). */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, root: HTMLElement = e.currentTarget as HTMLElement) {
  if (e.key !== "Tab") return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Keyboard-operable modal built on native <dialog>: the rest of the page is
 * inert, Tab wraps inside, Escape closes, and focus returns to the opener.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => {
      (opener.current as HTMLElement | null)?.focus?.();
      if (open) onClose();
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("close", onDialogClose);
    d.addEventListener("cancel", onCancel);
    d.addEventListener("keydown", trapTab);
    return () => {
      d.removeEventListener("close", onDialogClose);
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("keydown", trapTab);
    };
  }, [open, onClose]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx(
        "m-auto w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Close dialog">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ misc */

export function DefinitionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-slate-900 break-words">{v ?? <span className="text-slate-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
