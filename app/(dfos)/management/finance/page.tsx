import type { Metadata } from "next";
import { ManagementFinancePage } from "@/components/pages/ManagementPages";

export const metadata: Metadata = { title: "Financial performance" };

export default function Page() {
  return <ManagementFinancePage />;
}
