"use client";
// Demo persona switcher state. This demonstrates experience and filtering.
// It is NOT production authentication or a security boundary.
import { useSyncExternalStore } from "react";
import type { Viewer } from "@/domain/types";

export type Workspace = "operations" | "client" | "management";

export interface Persona {
  id: string;
  userId: string;
  clientId?: string;
  workspace: Workspace;
  label: string;
  name: string;
  title: string;
}

export const PERSONAS: Persona[] = [
  { id: "ops", userId: "u-rudo", workspace: "operations", label: "Operations", name: "Rudo Chikore", title: "Operations Supervisor" },
  { id: "mgmt", userId: "u-tafadzwa", workspace: "management", label: "Management", name: "Tafadzwa Mhlanga", title: "Managing Director" },
  { id: "client-ehis", userId: "u-grace", clientId: "c-ehis", workspace: "client", label: "Client · Eastern Highlands Industrial", name: "Grace Mukoko", title: "Procurement Manager" },
  { id: "client-kap", userId: "u-peter", clientId: "c-kap", workspace: "client", label: "Client · Kariba Agro Processors", name: "Peter Zhou", title: "Logistics Lead" },
  { id: "client-zmd", userId: "u-ruvimbo", clientId: "c-zmd", workspace: "client", label: "Client · Zambezi Medical Distributors", name: "Ruvimbo Dube", title: "Supply Chain Coordinator" },
];

export const WORKSPACE_HOME: Record<Workspace, string> = {
  operations: "/operations",
  client: "/client",
  management: "/management",
};

const KEY = "dfos.persona";
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function read(): string {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(KEY);
    } catch {
      cached = null;
    }
  }
  return PERSONAS.some((p) => p.id === cached) ? cached! : "ops";
}

export function setPersonaId(id: string) {
  cached = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* preference only; the in-memory value still applies for this tab */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Returns null during server render / before hydration. */
export function usePersona(): Persona | null {
  const id = useSyncExternalStore(subscribe, read, () => null);
  return id ? (PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]) : null;
}

export function viewerFor(p: Persona): Viewer {
  return p.clientId ? { kind: "client", userId: p.userId, clientId: p.clientId } : { kind: "staff", userId: p.userId };
}

export function viewerKey(v: Viewer) {
  return v.kind === "client" ? `client:${v.clientId}` : `staff:${v.userId}`;
}

export function workspaceOfPath(pathname: string): Workspace | null {
  if (pathname.startsWith("/operations")) return "operations";
  if (pathname.startsWith("/client")) return "client";
  if (pathname.startsWith("/management")) return "management";
  return null;
}

/** Which workspaces a persona may open. Staff may open both internal workspaces. */
export function canOpen(p: Persona, ws: Workspace | null) {
  if (ws === null) return true;
  if (p.workspace === "client") return ws === "client";
  return ws !== "client";
}

/** Management persona is read-only in operational screens. */
export function canWrite(p: Persona | null) {
  return !!p && p.id === "ops";
}
