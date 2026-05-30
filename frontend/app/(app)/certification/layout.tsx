import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connector Certification",
  description: "Six pre-flight safety checks. The same simulated reliability workflow used in the operations demo.",
};

export default function CertificationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
