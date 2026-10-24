import type { Metadata } from "next";
import { SettingsPage } from "@/components/pages/SettingsPage";

export const metadata: Metadata = { title: "Settings & demo data" };

export default function Page() {
  return <SettingsPage />;
}
