import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { Brand } from "./Brand";

const LINKS = ["Product", "How It Works", "Integrations", "Resources", "Company"];

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3.5">
        <Brand />
        <nav className="ml-4 hidden items-center gap-6 text-sm text-slate-300 lg:flex">
          {LINKS.map((l) => (
            <span key={l} className="cursor-default transition hover:text-white">
              {l}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-brand-400" /> Independent execution reliability prototype
          </span>
          <Link
            href="/operations"
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-glow-brand transition hover:brightness-110"
          >
            Request Early Access <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
