/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: { bg: "#0C0F15", card: "#131720", brd: "#1C2233" },
        t: { 1: "#E4E9F2", 2: "#9BA4B8", 3: "#5E6A82" },
        accent: { DEFAULT: "#6366F1", dim: "#6366F130" },
      },
    },
  },
  plugins: [],
};
