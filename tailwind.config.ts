import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "mockup-scan": {
          "0%": { transform: "translateY(-130%)" },
          "100%": { transform: "translateY(380%)" },
        },
        "questions-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(320%)" },
        },
        "landing-cue-in": {
          "0%": { opacity: "0", transform: "translateY(0.4rem)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "landing-interactive-pop": {
          "0%": { opacity: "0", transform: "translateY(0.35rem)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "mockup-scan": "mockup-scan 2.35s cubic-bezier(0.45, 0, 0.55, 1) infinite",
        "questions-shimmer":
          "questions-shimmer 1.85s cubic-bezier(0.45, 0, 0.55, 1) infinite",
        "landing-cue-in": "landing-cue-in 0.55s ease-out both",
        "landing-interactive-pop": "landing-interactive-pop 0.45s ease-out both",
      },
      colors: {
        renovision: {
          navy: "var(--renovision-navy)",
          orange: "var(--renovision-orange)",
          teal: "var(--renovision-teal)",
          "navy-muted": "var(--renovision-navy-muted)",
          "orange-muted": "var(--renovision-orange-muted)",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: "var(--destructive)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
    },
  },
  plugins: [],
} satisfies Config;
