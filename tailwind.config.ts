import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Terminal palette — exact HSL values mirrored from the reference
        // repo's assets/macro_terminal.css :root (pakkiraju/Market-Metrics-,
        // finviz-elite). Using hsl() literals keeps rendering pixel-identical
        // to the reference rather than approximate hex.
        bg: {
          DEFAULT: "hsl(220 20% 4%)",   // --background / --term-bg
          card: "hsl(220 20% 6%)",      // --card
          panel: "hsl(220 20% 7%)",     // --term-surface
          surface2: "hsl(220 20% 5%)",  // --term-surface2 / gradient stop
          hover: "hsl(220 20% 9%)",     // derived: one step above card
        },
        border: {
          DEFAULT: "hsl(220 15% 14%)",  // --term-border
          subtle: "hsl(220 15% 12%)",   // reference table row divider
        },
        text: {
          primary: "hsl(142 70% 70%)",   // --foreground (green-tinted)
          secondary: "hsl(220 10% 50%)", // --muted-foreground
          dim: "hsl(220 10% 40%)",       // --term-dim
        },
        accent: {
          orange: "#ff8c00",
          green: "hsl(142 70% 55%)",  // --term-green
          red: "hsl(0 72% 55%)",      // --term-red
          yellow: "#d29922",
          blue: "#58a6ff",
          purple: "#bc8cff",
          cyan: "hsl(185 70% 55%)",   // --term-cyan
          amber: "hsl(45 90% 55%)",   // --term-amber
        },
        signal: {
          hawkish: "hsl(0 72% 55%)",     // --term-red
          dovish: "hsl(142 70% 55%)",    // --term-green
          neutral: "hsl(220 10% 50%)",   // --muted-foreground
          tightening: "hsl(45 90% 55%)", // --term-amber
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'SF Mono'", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["'JetBrains Mono'", "'SF Mono'", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": "0.625rem",
      },
      borderRadius: {
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config;
