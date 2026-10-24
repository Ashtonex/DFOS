"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { listenForChanges } from "@/lib/sync";
import { ToastProvider } from "./toast";

function CrossTabBridge({ client }: { client: QueryClient }) {
  useEffect(() => listenForChanges(client), [client]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is local; revalidate on focus (cross-tab safety net), never poll.
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <CrossTabBridge client={client} />
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
