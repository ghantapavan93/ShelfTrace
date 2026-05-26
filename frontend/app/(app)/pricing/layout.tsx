import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing Engine",
  description: "Elasticity-based recommendations with a full constraint chain. Cost floor, KVI lock, perishable urgency, shock cap.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
