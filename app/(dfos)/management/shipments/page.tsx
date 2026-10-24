import type { Metadata } from "next";
import { ShipmentListPage } from "@/components/shipments/ShipmentListPage";

export const metadata: Metadata = { title: "Shipments" };

export default function Page() {
  return <ShipmentListPage workspace="management" />;
}
