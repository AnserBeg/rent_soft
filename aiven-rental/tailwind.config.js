/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./App.tsx", "./components/**/*.{ts,tsx}", "./services/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Rajdhani", "sans-serif"],
      },
      colors: {
        brand: {
          dark: "#0f172a",
          accent: "#f59e0b",
          secondary: "#3b82f6",
          surface: "#ffffff",
          background: "#f8fafc",
        },
      },
      animation: {
        "spin-slow": "spin 20s linear infinite",
      },
    },
  },
  plugins: [],
};
