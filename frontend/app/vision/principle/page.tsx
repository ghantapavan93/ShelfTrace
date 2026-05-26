import type { Metadata } from "next";
import PrinciplePage from "@/components/vision/PrinciplePage";

export const metadata: Metadata = {
  title: "Principle",
  description: "It guides. It does not act alone. How ShelfTrace fits between the pricing engine and the shopper.",
};

export default function VisionPrincipleRoute() {
  return <PrinciplePage />;
}
