import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Bloomberg/CRT terminal palette (HSL-derived; see plan)
        bg: {
          DEFAULT: "#0a0d12",   // hsl(220 20% 4%)
          card: "#0e1218",      // hsl(220 20% 6%)
          panel: "#10141c",     // hsl(220 20% 7%)
          surface2: "#0c0f15",  // hsl(220 20% 5%) — gradient bottom stop
          hover: "#171c25",
        },
        border: {
          DEFAULT: "#1f242f",   // hsl(220 15% 14%)
          subtle: "#1a1f29",    // hsl(220 15% 12%)
        },
        text: {
          primary: "#7ee3a4",   // hsl(142 70% 70%) — green-tinted
          secondary: "#7a8092", // hsl(220 10% 50%)
          dim: "#5e6473",       // hsl(220 10% 40%)
        },
        accent: {
          orange: "#ff8c00",
          green: "#3fcf6b",
          red: "#e04444",
          yellow: "#d29922",
          blue: "#58a6ff",
          purple: "#bc8cff",
          cyan: "#34c5d6",
          amber: "#f0b424",
        },
        signal: {
          hawkish: "#e04444",
          dovish: "#3fcf6b",
          neutral: "#7a8092",
          tightening: "#f0b424",
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
