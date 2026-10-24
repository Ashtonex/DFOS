import type { Metadata } from "next";
import { GuidePage } from "@/components/pages/GuidePage";

export const metadata: Metadata = { title: "Demo guide" };

export default function Page() {
  return <GuidePage />;
}
