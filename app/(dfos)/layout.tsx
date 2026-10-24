import { AppShell } from "@/components/shell/AppShell";

// One shared, persistent shell for every DFOS workspace route.
export default function DfosLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
