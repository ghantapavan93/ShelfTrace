import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Batch verification",
  description: "Full verification matrix for one batch — every SKU × store × channel cell drillable.",
};

export default function BatchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
