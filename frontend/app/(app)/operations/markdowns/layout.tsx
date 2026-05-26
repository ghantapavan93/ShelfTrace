import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Markdown SLAs",
  description: "Perishable items with deadline pressure — live countdown, escalating urgency, channel verification.",
};

export default function MarkdownsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
