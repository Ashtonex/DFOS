import type { Metadata } from "next";
import { OpsFinancePage } from "@/components/pages/OpsQueues";

export const metadata: Metadata = { title: "Funding & finance" };

export default function Page() {
  return <OpsFinancePage />;
}
