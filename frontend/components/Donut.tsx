export function Donut({
  verified,
  blocked,
  pending,
  total,
}: {
  verified: number;
  blocked: number;
  pending: number;
  total: number;
}) {
  const t = total || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: verified, color: "#34d399" },
    { v: blocked, color: "#f43f5e" },
    { v: pending, color: "#f59e0b" },
  ];
  let offset = 0;
  const pct = Math.round((100 * verified) / t);

  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
        {segs.map((s, i) => {
          const len = (s.v / t) * c;
          const el = (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="12"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-verified">{pct}%</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-400">Verified</span>
      </div>
    </div>
  );
}
