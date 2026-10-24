"use client";
// The ONE persistent application shell shared by Operations, Client and Management.
// Rendered by app/(dfos)/layout.tsx, so it is never remounted by internal navigation.
// It is deliberately not keyed by pathname.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FileCheck2,
  FileText,
  LayoutDashboard,
  ListChecks,
  Menu,
  Package,
  PlusCircle,
  Settings,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { PERSONAS, WORKSPACE_HOME, canOpen, setPersonaId, usePersona, workspaceOfPath, type Workspace } from "@/lib/persona";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/lib/sidebar";
import { cx, LoadingBlock, trapTab } from "../ui";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsMenu } from "./NotificationsMenu";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV: Record<Workspace, NavItem[]> = {
  operations: [
    { href: "/operations", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/operations/shipments", label: "Shipments", icon: Package },
    { href: "/operations/documents", label: "Document queue", icon: FileCheck2 },
    { href: "/operations/exceptions", label: "Exceptions", icon: AlertTriangle },
    { href: "/operations/finance", label: "Funding & finance", icon: Wallet },
    { href: "/operations/tasks", label: "Tasks", icon: ListChecks },
  ],
  client: [
    { href: "/client", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/client/shipments", label: "My shipments", icon: Package },
    { href: "/client/shipments/new", label: "New request", icon: PlusCircle, exact: true },
    { href: "/client/requests", label: "Funding & invoices", icon: Wallet },
    { href: "/client/documents", label: "Documents", icon: FileText },
  ],
  management: [
    { href: "/management", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/management/shipments", label: "Shipments", icon: Package },
    { href: "/management/exceptions", label: "Exceptions & follow-ups", icon: AlertTriangle },
    { href: "/management/finance", label: "Financial performance", icon: BarChart3 },
    { href: "/management/performance", label: "Officer workload", icon: Users },
  ],
};

const WS_LABEL: Record<Workspace, string> = { operations: "Operations", client: "Client portal", management: "Management" };

const COMMON: NavItem[] = [
  { href: "/guide", label: "Demo guide", icon: BookOpen },
  { href: "/settings", label: "Settings & demo data", icon: Settings },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (item.href === "/client/shipments" && pathname === "/client/shipments/new") return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function useNavWorkspace(): Workspace {
  const pathname = usePathname();
  const persona = usePersona();
  return workspaceOfPath(pathname) ?? persona?.workspace ?? "operations";
}

function NavList({ onNavigate, collapsible }: { onNavigate?: () => void; collapsible?: boolean }) {
  const pathname = usePathname();
  const ws = useNavWorkspace();
  const persona = usePersona();
  const items = NAV[ws];
  const link = (item: NavItem) => {
    const active = isActive(pathname, item);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={item.label}
          className={cx(
            "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
            active ? "bg-white/12 font-medium text-white" : "text-slate-300 hover:bg-white/8 hover:text-white",
            collapsible && "sidebar-collapsed:justify-center sidebar-collapsed:px-0",
          )}
        >
          <Icon className="size-4.5 shrink-0" aria-hidden />
          <span className={cx("truncate", collapsible && "sidebar-collapsed:sr-only")}>{item.label}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label={`${WS_LABEL[ws]} navigation`} className="flex flex-1 flex-col gap-4">
      <div>
        <div className={cx("px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400", collapsible && "sidebar-collapsed:sr-only")}>
          {WS_LABEL[ws]}
        </div>
        <ul className="space-y-0.5">{items.map(link)}</ul>
      </div>
      {persona && persona.workspace !== "client" && (
        <div>
          <div className={cx("px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400", collapsible && "sidebar-collapsed:sr-only")}>
            Workspaces
          </div>
          <ul className="space-y-0.5">
            {(["operations", "management"] as Workspace[])
              .filter((w) => w !== ws)
              .map((w) =>
                link({ href: WORKSPACE_HOME[w], label: `Open ${WS_LABEL[w]}`, icon: w === "operations" ? Package : BarChart3, exact: true }),
              )}
          </ul>
        </div>
      )}
      <ul className="mt-auto space-y-0.5 border-t border-white/10 pt-3">{COMMON.map(link)}</ul>
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-baseline gap-2 rounded" aria-label="DFOS home">
      <span className="text-lg font-bold tracking-tight text-white">DFOS</span>
      <span className="hidden truncate text-xs text-slate-300 sm:inline">Divine Freight Services</span>
    </Link>
  );
}

function PersonaSwitcher() {
  const persona = usePersona();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden rounded bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-navy-950 md:inline" title="Demo persona switcher. Not authentication.">
        DEMO
      </span>
      <label htmlFor="persona-switcher" className="sr-only">
        Demo persona (not authentication)
      </label>
      <select
        id="persona-switcher"
        data-testid="persona-switcher"
        // Disabled until hydrated: a change made before React attaches handlers would be lost.
        disabled={!persona}
        value={persona?.id ?? ""}
        onChange={(e) => {
          const next = PERSONAS.find((p) => p.id === e.target.value)!;
          const prev = persona;
          setPersonaId(next.id);
          const ws = workspaceOfPath(pathname);
          if (!canOpen(next, ws) || ws === null) router.push(WORKSPACE_HOME[next.workspace]);
          else if (prev?.clientId !== next.clientId && /^\/client\/shipments\/(?!new$)[^/]+/.test(pathname)) router.push("/client/shipments");
          else if (prev && prev.workspace !== next.workspace) router.push(WORKSPACE_HOME[next.workspace]);
        }}
        className="h-8 max-w-[11rem] truncate rounded-md border border-white/20 bg-navy-800 px-2 text-xs text-white sm:max-w-[15rem]"
      >
        {!persona && <option value="">Loading persona…</option>}
        {PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} — {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function SidebarToggle() {
  const collapsed = useSidebarCollapsed();
  return (
    <button
      type="button"
      data-testid="sidebar-toggle"
      onClick={() => setSidebarCollapsed(!collapsed)}
      aria-pressed={collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-slate-300 hover:bg-white/8 hover:text-white sidebar-collapsed:justify-center sidebar-collapsed:px-0"
    >
      {collapsed ? <ChevronsRight className="size-4.5" aria-hidden /> : <ChevronsLeft className="size-4.5" aria-hidden />}
      <span className="sidebar-collapsed:sr-only">Collapse sidebar</span>
    </button>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      onKeyDown={(e) => trapTab(e, e.currentTarget)}
      className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] bg-navy-900 p-0 text-white"
    >
      <div className="flex h-full flex-col p-3">
        <div className="mb-3 flex items-center justify-between">
          <Brand />
          <button type="button" onClick={onClose} aria-label="Close navigation" className="rounded p-1.5 text-slate-200 hover:bg-white/10">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <NavList onNavigate={onClose} />
      </div>
    </dialog>
  );
}

function WorkspaceGate({ children }: { children: ReactNode }) {
  const persona = usePersona();
  const pathname = usePathname();
  const router = useRouter();
  const ws = workspaceOfPath(pathname);
  if (!persona) return <LoadingBlock label="Loading workspace…" />;
  if (canOpen(persona, ws)) return <>{children}</>;
  const options = PERSONAS.filter((p) => canOpen(p, ws));
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-6" data-testid="workspace-gate">
      <h1 className="text-lg font-semibold">{ws === "client" ? "Choose a client persona" : "Not available to client personas"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        You are viewing DFOS as <strong>{persona.label}</strong>.{" "}
        {ws === "client"
          ? "The client portal shows one client's own records. Pick which client to view as."
          : "Internal workspaces are for Divine Freight staff. Switch to a staff persona to continue."}
      </p>
      <p className="mt-1 text-xs text-slate-500">The persona switcher demonstrates experience and filtering. It is not production authentication.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPersonaId(p.id)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            View as {p.label}
          </button>
        ))}
        <button type="button" onClick={() => router.push(WORKSPACE_HOME[persona.workspace])} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Go to my workspace
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  // Close the mobile drawer after any navigation (including back/forward).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header data-testid="shell-navbar" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-navy-950 px-3 text-white sm:gap-3 sm:px-4">
        <button
          type="button"
          className="rounded p-1.5 text-slate-200 hover:bg-white/10 md:hidden"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          data-testid="mobile-nav-button"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Brand />
        <div className="ml-2 hidden flex-1 md:block">
          <GlobalSearch />
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="md:hidden">
            <GlobalSearch compact />
          </div>
          <NotificationsMenu />
          <PersonaSwitcher />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          data-testid="shell-sidebar"
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col overflow-y-auto bg-navy-900 p-3 md:flex sidebar-collapsed:w-16 sidebar-collapsed:px-2"
        >
          <NavList collapsible />
          <div className="mt-2 border-t border-white/10 pt-2">
            <SidebarToggle />
          </div>
          <p className="mt-3 px-2.5 text-[10px] leading-snug text-slate-500 sidebar-collapsed:hidden">
            Prototype by Flectēre · fictional demo data
          </p>
        </aside>
        <main id="main" data-testid="main-content" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <WorkspaceGate>
            <Suspense fallback={<LoadingBlock label="Loading page…" />}>{children}</Suspense>
          </WorkspaceGate>
        </main>
      </div>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
