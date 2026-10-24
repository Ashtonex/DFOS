import type { Metadata } from "next";
import { ClientRequestForm } from "@/components/client/ClientRequestForm";

export const metadata: Metadata = { title: "New shipment request" };

export default function Page() {
  return <ClientRequestForm />;
}
