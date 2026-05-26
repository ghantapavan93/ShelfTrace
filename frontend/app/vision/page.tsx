import type { Metadata } from "next";
import SignalPage from "@/components/vision/SignalPage";

export const metadata: Metadata = {
  title: "Vision Studio",
  description: "A price is not real until every surface agrees. The narrative entry to the platform.",
};

export default function VisionSignalRoute() {
  return <SignalPage />;
}
