/* eslint-disable @next/next/no-img-element */

/**
 * Dynamic Open Graph image — generated at build time by next/og.
 *
 * What this renders when someone shares any URL of the deployed app:
 *   • Dark ink-950 background with subtle radial gradient
 *   • Brand mark in the violet→orange gradient (matches the sidebar logo)
 *   • Wordmark + "Control Plane" eyebrow
 *   • Hero one-line: the product truth, not a marketing line
 *   • Quiet meta strip showing the engineering signal (test count,
 *     architecture nouns) — anchors credibility without being loud
 *
 * Lives at /opengraph-image — Vercel serves it as PNG automatically.
 * Tested aspect: 1200 × 630 (LinkedIn / Slack unfurl spec).
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ShelfTrace — Reliability layer for grocery price execution";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at 75% 10%, rgba(251,146,60,0.18) 0%, transparent 55%), radial-gradient(ellipse at 10% 85%, rgba(167,139,250,0.12) 0%, transparent 55%), #040608",
          display: "flex",
          flexDirection: "column",
          padding: "70px 80px",
          fontFamily: "Inter",
          color: "white",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
              boxShadow: "0 0 40px rgba(251,146,60,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M4 7l8-4 8 4-8 4-8-4z" fill="white" fillOpacity="0.9" />
              <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <div style={{ fontSize: "44px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              ShelfTrace
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                letterSpacing: "0.22em",
                color: "#fb923c",
                marginTop: "6px",
                textTransform: "uppercase",
              }}
            >
              Control Plane
            </div>
          </div>
        </div>

        {/* Hero one-line */}
        <div
          style={{
            marginTop: "120px",
            fontSize: "78px",
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: "-0.03em",
            maxWidth: "1000px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>A price is not real</span>
          <span style={{ color: "#fb923c" }}>until every system agrees.</span>
        </div>

        {/* Meta strip — quiet credibility */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "rgba(255,255,255,0.55)",
            fontSize: "20px",
            fontFamily: "Inter",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              border: "1px solid rgba(34,197,94,0.4)",
              background: "rgba(34,197,94,0.08)",
              color: "#86efac",
              borderRadius: "999px",
              padding: "8px 18px",
              fontSize: "16px",
              fontWeight: 600,
              letterSpacing: "0.18em",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: "#22c55e",
                display: "block",
              }}
            />
            REAL BACKEND
          </span>
          <span style={{ display: "flex" }}>
            FastAPI · PostgreSQL outbox · Redis worker · full test suite
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
