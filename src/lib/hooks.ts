"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import * as repo from "@/data/repository";
import { usePersona, viewerFor, viewerKey, type Persona } from "./persona";
import { qk, type Topic } from "./queryKeys";
import { announceChange, invalidateTopics } from "./sync";

export function useViewer() {
  const persona = usePersona();
  const viewer = persona ? viewerFor(persona) : null;
  return { persona, viewer, vk: viewer ? viewerKey(viewer) : "pending" };
}

export function useWorkspace() {
  const { viewer, vk } = useViewer();
  return useQuery({
    queryKey: qk.workspace(vk),
    queryFn: () => repo.getWorkspace(viewer!),
    enabled: !!viewer,
  });
}

export function useShipmentDetail(id: string) {
  const { viewer, vk } = useViewer();
  return useQuery({
    queryKey: qk.shipment(vk, id),
    queryFn: () => repo.getShipmentDetail(viewer!, id),
    enabled: !!viewer,
  });
}

export function useReference() {
  const { viewer, vk } = useViewer();
  return useQuery({
    queryKey: qk.reference(vk),
    queryFn: () => repo.getReferenceData(viewer!),
    enabled: !!viewer,
    staleTime: Infinity,
  });
}

export function useSearch(q: string) {
  const { viewer, vk } = useViewer();
  return useQuery({
    queryKey: qk.search(vk, q),
    queryFn: () => repo.search(viewer!, q),
    enabled: !!viewer && q.trim().length >= 2,
  });
}

/** A fresh idempotency key per logical submission; renew after success. */
export function useOpId() {
  const [opId, setOpId] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setOpId(crypto.randomUUID()), []);
  return [opId, renew] as const;
}

/**
 * Wraps a repository mutation: awaits persistence, then invalidates the declared
 * topics here and in other tabs. Errors are surfaced to the caller (never swallowed).
 */
export function useDfosMutation<TVars, TResult>(opts: {
  mutationFn: (persona: Persona, vars: TVars) => Promise<TResult>;
  topics: Topic[];
  shipmentId?: (vars: TVars) => string | undefined;
}) {
  const qc = useQueryClient();
  const persona = usePersona();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      if (!persona) throw new Error("Persona not ready yet.");
      return opts.mutationFn(persona, vars);
    },
    onSuccess: async (_r, vars) => {
      const sid = opts.shipmentId?.(vars);
      announceChange(opts.topics, sid);
      await invalidateTopics(qc, opts.topics, sid);
    },
  });
}

/**
 * Warns before leaving a form with unsaved changes: on reload/close (beforeunload)
 * and on in-app link clicks (capture-phase click interception). Inactive when clean.
 */
export function useUnsavedChangesGuard(dirty: boolean, message = "You have unsaved changes. Leave without saving?") {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

/** Shorthand for a repository action performed as the current persona. */
export function useAction<A>(fn: (userId: string, args: A) => Promise<unknown>, topics: Topic[], shipmentId?: string | ((a: A) => string | undefined)) {
  return useDfosMutation({
    mutationFn: (p, a: A) => fn(p.userId, a),
    topics,
    shipmentId: typeof shipmentId === "function" ? shipmentId : () => shipmentId,
  });
}
