import type { Metadata } from "next";
import HorizonPage from "@/components/vision/HorizonPage";

export const metadata: Metadata = {
  title: "Horizon",
  description: "What this reliability foundation could enable next — four future-state concepts.",
};

export default function VisionHorizonRoute() {
  return <HorizonPage />;
}
