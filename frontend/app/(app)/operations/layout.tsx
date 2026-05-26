import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Operations",
  description: "Command center for the active rollout. Canary verification, critical incidents, expansion gating.",
};

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
