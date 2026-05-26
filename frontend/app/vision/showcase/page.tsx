import type { Metadata } from "next";
import ShowcasePage from "@/components/vision/ShowcasePage";

export const metadata: Metadata = {
  title: "Showcase",
  description: "The price they ring up should be the price you approved. Cinematic walkthrough.",
};

export default function VisionShowcaseRoute() {
  return <ShowcasePage />;
}
