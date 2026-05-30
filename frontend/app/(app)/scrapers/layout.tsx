import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Signal Intake",
  description: "Production-shaped data extraction pipeline — fetch, parse, validate, dedupe, upsert.",
};

export default function ScrapersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
