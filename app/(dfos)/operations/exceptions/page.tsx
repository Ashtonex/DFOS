import type { Metadata } from "next";
import { ExceptionsPage } from "@/components/pages/OpsQueues";

export const metadata: Metadata = { title: "Exceptions" };

export default function Page() {
  return <ExceptionsPage workspace="operations" />;
}
