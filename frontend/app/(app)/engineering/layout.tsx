import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evidence & Replay",
  description: "The pipeline made visible — FastAPI ingestion, PostgreSQL outbox, inline outbox drain, reconciliation engine.",
};

export default function EngineeringLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
