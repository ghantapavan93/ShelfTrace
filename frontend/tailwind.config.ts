import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06060b",
          900: "#0a0a12",
          850: "#0e0e1a",
          800: "#13131f",
          700: "#1b1b2b",
          600: "#262638",
        },
        brand: {
          DEFAULT: "#ff6a2b",
          500: "#ff6a2b",
          400: "#ff8552",
          600: "#e6571c",
        },
        verified: "#34d399",
        warn: "#f59e0b",
        danger: "#f43f5e",
        violetglow: "#7c3aed",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 0 40px -8px rgba(124,58,237,0.35)",
        "glow-danger": "0 0 40px -6px rgba(244,63,94,0.55)",
        "glow-verified": "0 0 40px -6px rgba(52,211,153,0.5)",
        "glow-brand": "0 0 40px -6px rgba(255,106,43,0.55)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "rise": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        flow: "flow 3s linear infinite",
        rise: "rise 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
