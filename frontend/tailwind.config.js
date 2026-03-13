/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#7b2ff7",
          light: "#a75df9",
          dark: "#5a19c9",
        },
        accent: "#ff5fa2",
        surface: "#f6f3ff",
        muted: "#7c7a8c",
        success: "#2dbd6e",
        warn: "#f7b84b",
        info: "#57a5ff",
      },
      fontFamily: {
        display: ["'Sora'", "Inter", "system-ui", "sans-serif"],
        body: ["'Manrope'", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 12px 30px rgba(94, 58, 255, 0.12)",
      },
    },
  },
  plugins: [],
}
