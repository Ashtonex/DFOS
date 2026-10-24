import type { Metadata } from "next";
import { PerformancePage } from "@/components/pages/ManagementPages";

export const metadata: Metadata = { title: "Officer workload" };

export default function Page() {
  return <PerformancePage />;
}
