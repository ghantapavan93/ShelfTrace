import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Perishable Deadline Desk",
  description: "Perishable items with deadline pressure — live countdown, escalating urgency, channel verification.",
};

export default function MarkdownsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
