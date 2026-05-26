import type { Metadata } from "next";
import KeynotePage from "@/components/vision/KeynotePage";

export const metadata: Metadata = {
  title: "Keynote",
  description: "The product story — what the platform is, why it exists, and what it protects.",
};

export default function VisionKeynoteRoute() {
  return <KeynotePage />;
}
