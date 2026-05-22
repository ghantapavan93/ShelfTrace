import clsx from "clsx";

export function MetricCard({
  value,
  label,
  sub,
  tone = "default",
  progress,
}: {
  value: React.ReactNode;
  label: string;
  sub?: string;
  tone?: "default" | "danger" | "warn" | "verified" | "brand";
  progress?: number; // 0..1
}) {
  const toneCls = {
    default: "text-white",
    danger: "text-danger text-glow-danger",
    warn: "text-warn",
    verified: "text-verified",
    brand: "text-brand-400",
  }[tone];
  const bar = {
    default: "bg-white/30",
    danger: "bg-danger",
    warn: "bg-warn",
    verified: "bg-verified",
    brand: "bg-brand",
  }[tone];

  return (
    <div className="glass rounded-2xl px-4 py-4">
      <div className={clsx("text-3xl font-bold leading-none tabular-nums", toneCls)}>{value}</div>
      <div className="mt-2 text-sm font-medium text-slate-200">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      {progress != null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className={clsx("h-full rounded-full", bar)} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
