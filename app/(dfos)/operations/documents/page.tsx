import type { Metadata } from "next";
import { DocumentQueuePage } from "@/components/pages/DocumentQueuePage";

export const metadata: Metadata = { title: "Document queue" };

export default function Page() {
  return <DocumentQueuePage />;
}
