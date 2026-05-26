import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engineering Trace",
  description: "The pipeline made visible — FastAPI ingestion, PostgreSQL outbox, Redis worker, reconciliation engine.",
};

export default function EngineeringLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
