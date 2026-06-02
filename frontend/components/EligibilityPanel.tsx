"use client";

import { CheckCircle2, CircleAlert, Hourglass, ShieldOff } from "lucide-react";
import clsx from "clsx";
import type { MeasurementEligibilityView } from "@/lib/types";

/**
 * Read-only display of an action's *measurement* eligibility. Distinct from
 * the rollout-expansion decision shown elsewhere on the page.
 *
 * Renders only the values returned by the backend; no synthesis, no rounding,
 * no fabricated outcomes. If the backend doesn't return the field (older
 * client / older endpoint), the panel renders nothing.
 */
export function EligibilityPanel({
  eligibility,
  variant = "incident",
}: {
  eligibility: MeasurementEligibilityView | null | undefined;
  variant?: "incident" | "engineering";
}) {
  if (!eligibility) return null;

  const tone = toneFor(eligibility.status);
  const Icon = iconFor(eligibility.status);
  const shortLabel = shortFor(eligibility.status);

  if (variant === "engineering") {
    return <EngineeringEvidence eligibility={eligibility} tone={tone} />;
  }

  return (
    <section
      className={clsx(
        "rounded-2xl border p-5 shadow-[0_18px_60px_-40px]",
        tone.ring,
        tone.bg,
        tone.shadow,
      )}
      aria-label="Execution Measurement Eligibility"
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            tone.ring,
            tone.iconBg,
            tone.iconColor,
            tone.iconGlow,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-white/55">
            Execution Measurement Eligibility
          </div>
          <p className={clsx("mt-1 font-mono text-sm font-semibold tracking-tight", tone.text)}>
            {shortLabel}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200/85">{eligibility.summary}</p>

          {/* §9 — Make the measurement quarantine unmistakable. The principle is
              always stated; once execution is verified, the clean-window line
              confirms when honest measurement can resume. */}
          <p className="mt-3 border-l-2 border-white/15 pl-3 text-[13px] italic leading-relaxed text-slate-300">
            An agent should never learn from an action the shopper did not correctly experience.
          </p>
          {eligibility.status === "ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED" && (
            <p className="mt-2 text-[13px] leading-relaxed text-emerald-200/90">
              Execution verified at $5.99. A clean measurement window begins from the
              acknowledgement timestamp.
            </p>
          )}

          <ChannelChips eligibility={eligibility} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Engineering Trace variant: an evidence block with explicit fields. */
/* ------------------------------------------------------------------ */

function EngineeringEvidence({
  eligibility,
  tone,
}: {
  eligibility: MeasurementEligibilityView;
  tone: Tone;
}) {
  return (
    <div className={clsx("rounded-2xl border p-5", tone.ring, "bg-[#0a0e18]/85")}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[.22em] text-orange-300">
          MEASUREMENT ELIGIBILITY EVIDENCE
        </span>
        <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-mono", tone.text, tone.iconBg)}>
          {shortFor(eligibility.status)}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-y-2 font-mono text-[12px] text-slate-300 sm:grid-cols-[170px_1fr]">
        <Row label="status" value={eligibility.status} valueClass={tone.text} />
        <Row label="reason" value={eligibility.reason} />
        <Row
          label="required_channels"
          value={eligibility.required_channels.join(", ") || "—"}
        />
        <Row
          label="verified_channels"
          value={eligibility.verified_channels.join(", ") || "—"}
          valueClass="text-emerald-300"
        />
        {eligibility.blocked_channel && (
          <Row
            label="blocked_channel"
            value={eligibility.blocked_channel}
            valueClass="text-rose-300"
          />
        )}
        <Row
          label="audit_causality"
          value="enforced"
          valueClass="text-emerald-300"
        />
      </dl>
      <p className="mt-3 text-[11px] text-slate-400">
        Derived read-only from existing receipt + incident state. No new tables, no new
        write paths, no new audit events.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}:</dt>
      <dd className={clsx("truncate", valueClass)}>{value}</dd>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Channel chips (verified vs blocked vs missing).                    */
/* ------------------------------------------------------------------ */

function ChannelChips({ eligibility }: { eligibility: MeasurementEligibilityView }) {
  const verified = new Set(eligibility.verified_channels);
  const blocked = eligibility.blocked_channel;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {eligibility.required_channels.map((ch) => {
        const isVerified = verified.has(ch);
        const isBlocked = blocked === ch;
        const cls = isVerified
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
          : isBlocked
            ? "border-rose-500/45 bg-rose-500/10 text-rose-200"
            : "border-amber-500/35 bg-amber-500/10 text-amber-200";
        const Icon = isVerified ? CheckCircle2 : isBlocked ? CircleAlert : Hourglass;
        return (
          <span
            key={ch}
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[.18em]",
              cls,
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {ch}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tone + label helpers.                                              */
/* ------------------------------------------------------------------ */

type Tone = {
  ring: string;
  bg: string;
  shadow: string;
  iconBg: string;
  iconColor: string;
  text: string;
  iconGlow: string;
};

const TONES: Record<MeasurementEligibilityView["status"], Tone> = {
  ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED: {
    ring: "border-emerald-500/40",
    bg: "bg-emerald-500/[.06]",
    shadow: "shadow-emerald-500/20",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-300",
    text: "text-emerald-200",
    iconGlow: "shadow-glow-verified",
  },
  INELIGIBLE_AWAITING_ACKNOWLEDGEMENT: {
    ring: "border-amber-500/40",
    bg: "bg-amber-500/[.06]",
    shadow: "shadow-amber-500/20",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-300",
    text: "text-amber-200",
    iconGlow: "shadow-[0_0_26px_-6px_rgba(251,191,36,0.55)]",
  },
  INELIGIBLE_EXECUTION_NOT_VERIFIED: {
    ring: "border-rose-500/45",
    bg: "bg-rose-500/[.06]",
    shadow: "shadow-rose-500/25",
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-300",
    text: "text-rose-200",
    iconGlow: "shadow-glow-danger",
  },
  EXCLUDED_RECOVERY_INCOMPLETE: {
    ring: "border-violet-500/40",
    bg: "bg-violet-500/[.06]",
    shadow: "shadow-violet-500/20",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-300",
    text: "text-violet-200",
    iconGlow: "shadow-[0_0_26px_-8px_rgba(167,139,250,0.6)]",
  },
};

function toneFor(status: MeasurementEligibilityView["status"]): Tone {
  return TONES[status];
}

function iconFor(status: MeasurementEligibilityView["status"]) {
  switch (status) {
    case "ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED":
      return CheckCircle2;
    case "INELIGIBLE_AWAITING_ACKNOWLEDGEMENT":
      return Hourglass;
    case "INELIGIBLE_EXECUTION_NOT_VERIFIED":
      return CircleAlert;
    case "EXCLUDED_RECOVERY_INCOMPLETE":
      return ShieldOff;
  }
}

function shortFor(status: MeasurementEligibilityView["status"]): string {
  switch (status) {
    case "ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED":
      return "ELIGIBLE";
    case "INELIGIBLE_AWAITING_ACKNOWLEDGEMENT":
      return "INELIGIBLE · AWAITING ACK";
    case "INELIGIBLE_EXECUTION_NOT_VERIFIED":
      return "INELIGIBLE";
    case "EXCLUDED_RECOVERY_INCOMPLETE":
      return "EXCLUDED · RECOVERY INCOMPLETE";
  }
}
