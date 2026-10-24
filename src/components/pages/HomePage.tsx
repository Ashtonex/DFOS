"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, BookOpen, Package, Users } from "lucide-react";
import { PERSONAS, WORKSPACE_HOME, setPersonaId, usePersona } from "@/lib/persona";
import { PageHeader } from "../ui";

export function HomePage() {
  const persona = usePersona();
  const router = useRouter();
  const open = (personaId: string) => {
    const p = PERSONAS.find((x) => x.id === personaId)!;
    setPersonaId(p.id);
    router.push(WORKSPACE_HOME[p.workspace]);
  };
  const cards = [
    { persona: "ops", icon: Package, title: "Operations", text: "Clearance officers, coordinators and finance: shipments, documents, exceptions, funding and disbursements." },
    { persona: "client-ehis", icon: Users, title: "Client portal", text: "A client's own shipments, outstanding requirements, document uploads, funding requests and payment notifications." },
    { persona: "mgmt", icon: BarChart3, title: "Management", text: "Active files, exceptions, overdue follow-ups, officer workload, unrecovered disbursements and illustrative profitability." },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Divine Freight Services · prototype by Flectēre"
        title="DFOS — Divine Freight Operating System"
        subtitle="One shared set of records, viewed through three connected workspaces. All data is fictional demonstration data stored in this browser."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.persona}
            type="button"
            onClick={() => open(c.persona)}
            className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-navy-600"
          >
            <c.icon className="size-5 text-accent-700" aria-hidden />
            <div className="mt-2 font-semibold">{c.title}</div>
            <p className="mt-1 text-sm text-slate-600">{c.text}</p>
            <span className="mt-3 inline-block text-sm font-medium text-navy-700">
              Open as {PERSONAS.find((p) => p.id === c.persona)!.name} →
            </span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-accent-100 bg-accent-50 p-4 text-sm">
        <BookOpen className="size-5 text-accent-700" aria-hidden />
        <span className="flex-1">
          Presenting? Follow the <strong>guided demonstration</strong> of shipment DF-DEMO-2026-001 from client request to closure.
        </span>
        <Link href="/guide" className="rounded-md bg-navy-900 px-3 py-1.5 font-medium text-white hover:bg-navy-800">
          Open demo guide
        </Link>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Current persona: {persona ? `${persona.label} (${persona.name})` : "loading…"}. The persona switcher demonstrates experience and
        filtering. It is not production authentication or a security boundary.
      </p>
    </div>
  );
}
