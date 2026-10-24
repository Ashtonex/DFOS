import type { Metadata } from "next";
import { OperationsDashboard } from "@/components/pages/OperationsDashboard";

export const metadata: Metadata = { title: "Operations" };

export default function Page() {
  return <OperationsDashboard />;
}
