import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DFOS — Divine Freight Operating System", template: "%s · DFOS" },
  description: "DFOS demonstration prototype for Divine Freight Services, by Flectēre. Fictional demonstration data.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applies the persisted sidebar preference before first paint (no layout shift).
const sidebarScript = `try{if(localStorage.getItem("dfos.sidebarCollapsed")==="1")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: sidebarScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
