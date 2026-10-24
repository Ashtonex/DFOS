// Central query-key strategy. Every query key starts with a TOPIC. Mutations
// declare which topics they change; only queries under those topics are
// invalidated (locally and, via BroadcastChannel, in other tabs).

export type Topic = "reference" | "workspace" | "shipment" | "search" | "seed";

export const qk = {
  reference: (vk: string) => ["reference", vk] as const,
  /** Scoped snapshot + derived rows: lists, dashboards, queues, KPIs. */
  workspace: (vk: string) => ["workspace", vk] as const,
  shipment: (vk: string, id: string) => ["shipment", vk, id] as const,
  search: (vk: string, q: string) => ["search", vk, q] as const,
  seed: () => ["seed"] as const,
};

/** Topics touched by each kind of change. */
export const TOPICS = {
  shipmentRecord: ["workspace", "shipment", "search"],
  documents: ["workspace", "shipment", "search"],
  workflow: ["workspace", "shipment"],
  finance: ["workspace", "shipment"],
  reset: ["reference", "workspace", "shipment", "search", "seed"],
} satisfies Record<string, Topic[]>;
