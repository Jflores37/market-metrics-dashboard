import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Bloomberg terminal palette
        bg: {
          DEFAULT: "#0a0e14",
          card: "#0f1419",
          panel: "#11161d",
          hover: "#1a1f28",
        },
        border: {
          DEFAULT: "#1c2128",
          subtle: "#161b22",
        },
        text: {
          primary: "#e6edf3",
          secondary: "#8b949e",
          dim: "#6e7681",
        },
        accent: {
          orange: "#ff8c00",
          green: "#3fb950",
          red: "#f85149",
          yellow: "#d29922",
          blue: "#58a6ff",
          purple: "#bc8cff",
        },
        signal: {
          hawkish: "#f85149",
          dovish: "#3fb950",
          neutral: "#8b949e",
          tightening: "#d29922",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'SF Mono'", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["'Inter'", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      fontSize: {
        "2xs": "0.625rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
