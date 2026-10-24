import type { Metadata } from "next";
import { ClientShipmentList } from "@/components/client/ClientPages";

export const metadata: Metadata = { title: "My shipments" };

export default function Page() {
  return <ClientShipmentList />;
}
