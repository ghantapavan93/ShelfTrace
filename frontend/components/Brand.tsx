import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-600 shadow-glow-brand">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none">
          <path d="M4 7l8-4 8 4-8 4-8-4z" fill="currentColor" opacity="0.9" />
          <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-bold tracking-tight text-white">ShelfTrace</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-400">
            Control Plane
          </span>
        </span>
      )}
    </Link>
  );
}
