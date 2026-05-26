import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Competitor Scraping",
  description: "Production-shaped data extraction pipeline — fetch, parse, validate, dedupe, upsert.",
};

export default function ScrapersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
