import type { Metadata } from "next";
import { ClientDocumentsPage } from "@/components/client/ClientPages";

export const metadata: Metadata = { title: "Documents" };

export default function Page() {
  return <ClientDocumentsPage />;
}
