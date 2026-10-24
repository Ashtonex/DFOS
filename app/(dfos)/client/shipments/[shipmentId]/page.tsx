import type { Metadata } from "next";
import { ClientShipmentDetail } from "@/components/client/ClientPages";

export const metadata: Metadata = { title: "Shipment" };

export default async function Page({ params }: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await params;
  return <ClientShipmentDetail shipmentId={decodeURIComponent(shipmentId)} />;
}
