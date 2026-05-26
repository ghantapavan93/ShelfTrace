import type { Metadata } from "next";
import FuturesPage from "@/components/vision/FuturesPage";

export const metadata: Metadata = {
  title: "Futures",
  description: "Beyond reliability — the product imagination. Seven exploratory surfaces.",
};

export default function VisionFuturesRoute() {
  return <FuturesPage />;
}
