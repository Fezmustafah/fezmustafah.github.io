/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#11203A",
        deep: "#0B1626",
        paper: "#F4F1EA",
        brass: "#A9853F",
        brassLight: "#C6A765",
        hairline: "#E5E0D5",
        slate: "#5B6B82",
        // Daily Invoice Tracker palette (separate from the editor's navy/brass)
        tnavy: "#1B2A5B",
        tgold: "#C8A951",
        tcream: "#FAF8F3",
        tcreamDark: "#E0DDD5",
      },
      fontFamily: {
        // premium type system shared with the marketing site
        wordmark: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      letterSpacing: { tightest: "-0.035em" },
      boxShadow: {
        card: "0 18px 44px -26px rgba(11,22,38,0.28)",
        lift: "0 28px 70px -30px rgba(11,22,38,0.42)",
      },
    },
  },
  plugins: [],
};
