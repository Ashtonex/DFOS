import type { Persona, Workspace } from "./persona";

export function shipmentBase(ws: Workspace) {
  return ws === "client" ? "/client/shipments" : ws === "management" ? "/management/shipments" : "/operations/shipments";
}

export function shipmentHref(persona: Persona | Workspace, shipmentId: string, tab?: string) {
  const ws = typeof persona === "string" ? persona : persona.workspace;
  const base = `${shipmentBase(ws)}/${shipmentId}`;
  return tab ? `${base}?tab=${tab}` : base;
}
