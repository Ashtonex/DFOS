import type { Metadata } from "next";
import { ClientRequestsPage } from "@/components/client/ClientPayments";

export const metadata: Metadata = { title: "Funding & invoices" };

export default function Page() {
  return <ClientRequestsPage />;
}
