import type { Metadata } from "next";
import { ManagementDashboard } from "@/components/pages/ManagementPages";

export const metadata: Metadata = { title: "Management" };

export default function Page() {
  return <ManagementDashboard />;
}
