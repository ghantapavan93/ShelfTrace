import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exception Command Center",
  description: "Triage and recover from every channel mismatch, timeout, or deadline risk. Full audit timeline per incident.",
};

export default function IncidentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
