import type { Metadata } from "next";
import { ClientOverview } from "@/components/client/ClientPages";

export const metadata: Metadata = { title: "Client portal" };

export default function Page() {
  return <ClientOverview />;
}
