import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f1e8",
        ink: "#102031",
        muted: "#5d6875",
        panel: "#fffaf1",
        accent: "#d76233",
        accentSoft: "#f8d8ca",
        teal: "#1c786f",
        line: "#d8cdbd"
      },
      boxShadow: {
        panel: "0 14px 40px rgba(16, 32, 49, 0.08)"
      },
      fontFamily: {
        sans: ["Avenir Next", "Segoe UI", "Helvetica Neue", "sans-serif"],
        display: ["Iowan Old Style", "Palatino", "Georgia", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
