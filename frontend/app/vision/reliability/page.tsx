import type { Metadata } from "next";
import TheaterPage from "@/components/vision/TheaterPage";

export const metadata: Metadata = {
  title: "Reliability Theater",
  description: "The working system behind trusted price execution — certification, rollout, trace.",
};

export default function VisionReliabilityRoute() {
  return <TheaterPage />;
}
