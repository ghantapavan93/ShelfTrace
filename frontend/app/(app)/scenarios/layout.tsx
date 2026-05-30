import type { Metadata } from "next";

// Wraps the client-side ScenarioBuilder page so the tab title + OG
// description reflect the actual surface (the page itself can't export
// metadata because it's a "use client" component).
export const metadata: Metadata = {
  title: "Action Simulator",
  description: "Configure a connector test without changing code. Upload a CSV, set the canary, run the rollout.",
};

export default function ScenariosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
