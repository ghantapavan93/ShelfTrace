import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description: "One canonical entity per real-world product, linked to every internal SKU and competitor source.",
};

export default function ProductGraphLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
