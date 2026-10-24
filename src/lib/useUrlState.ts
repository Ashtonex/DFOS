"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Reads/writes list state (filters, sort, page) in URL parameters via client-side navigation. */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = useCallback((k: string, fallback = "") => params.get(k) ?? fallback, [params]);
  const set = useCallback(
    (patch: Record<string, string | null>, opts: { push?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts.push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );
  return { get, set, params };
}
