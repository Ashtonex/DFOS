import type { Metadata } from "next";
import { ShipmentDetailPage } from "@/components/shipments/ShipmentDetailPage";

export const metadata: Metadata = { title: "Shipment" };

export default async function Page({ params }: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await params;
  return <ShipmentDetailPage shipmentId={decodeURIComponent(shipmentId)} />;
}
