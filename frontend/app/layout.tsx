import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://shelf-trace.vercel.app"),
  title: {
    default: "ShelfTrace — Reliability for grocery price execution",
    template: "%s · ShelfTrace",
  },
  description:
    "A reliability control plane for approved retail price execution. Canary containment, deterministic reconciliation across shelf, POS and ecommerce, audit-verified recovery — backed by a PostgreSQL-backed test suite.",
  applicationName: "ShelfTrace Control Plane",
  authors: [{ name: "Pavan Kalyan Ghanta" }],
  keywords: [
    "grocery pricing",
    "price execution",
    "retail reliability",
    "canary rollout",
    "transactional outbox",
    "BetterBasket",
  ],
  openGraph: {
    type: "website",
    siteName: "ShelfTrace",
    title: "ShelfTrace — A price is not real until every system agrees.",
    description:
      "Reliability layer for approved grocery price execution. Canary containment, deterministic reconciliation, audit-verified recovery.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShelfTrace — Reliability for grocery price execution",
    description:
      "Canary containment, deterministic reconciliation across shelf · POS · ecommerce, audit-verified recovery.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-ink-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
