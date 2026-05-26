import type { Metadata } from "next";
import ConnectPage from "@/components/vision/ConnectPage";

export const metadata: Metadata = {
  title: "Connect",
  description: "Bring your data. Watch it travel through. The eight capabilities the engine operates on.",
};

export default function VisionConnectRoute() {
  return <ConnectPage />;
}
