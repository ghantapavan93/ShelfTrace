import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Certification Lab",
  description: "Six pre-flight safety checks. The same engine that runs production rollouts.",
};

export default function CertificationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
