"use client";
import type { QueryClient } from "@tanstack/react-query";
import type { Topic } from "./queryKeys";

export interface ChangeMessage {
  topics: Topic[];
  shipmentId?: string;
  origin: string;
}

const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
let channel: BroadcastChannel | null = null;

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel("dfos-changes");
  return channel;
}

/** Invalidates exactly the queries under the changed topics. */
export function invalidateTopics(qc: QueryClient, topics: Topic[], shipmentId?: string) {
  return Promise.all(
    topics.map((t) =>
      t === "shipment" && shipmentId
        ? qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "shipment" && q.queryKey[2] === shipmentId })
        : qc.invalidateQueries({ queryKey: [t] }),
    ),
  );
}

/** Called after a successful local mutation. Other tabs invalidate but never rebroadcast (no loops). */
export function announceChange(topics: Topic[], shipmentId?: string) {
  const msg: ChangeMessage = { topics, shipmentId, origin: TAB_ID };
  getChannel()?.postMessage(msg);
}

export function listenForChanges(qc: QueryClient) {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMessage = (e: MessageEvent<ChangeMessage>) => {
    if (!e.data || e.data.origin === TAB_ID) return;
    void invalidateTopics(qc, e.data.topics, e.data.shipmentId);
  };
  ch.addEventListener("message", onMessage);
  return () => ch.removeEventListener("message", onMessage);
}
