import type { ReactNode } from "react";
import { GlobalHeader, ProgressNavigation, VisionFooter } from "@/components/vision/Shell";

export const metadata = {
  title: "Vision Studio · ShelfTrace",
  description:
    "Interactive concept vision for ShelfTrace — Signal to Shelf, Reliability Theater, Horizon Studio.",
};

export default function VisionLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#060910] text-white selection:bg-orange-500/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_14%,rgba(249,115,22,.09),transparent_25%),radial-gradient(circle_at_88%_12%,rgba(89,64,179,.10),transparent_28%),linear-gradient(180deg,#060910,#070a12)]" />
      <GlobalHeader />
      {children}
      <VisionFooter />
      <ProgressNavigation />
    </main>
  );
}
