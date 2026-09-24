/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Colour palette.
      colors: {
        ink: "#0A0E1A",      // page background
        surface: "#141A2A",  // cards and inputs,
        line: "#26304A",     // borders, 
        signal: "#3B82F6",   // primary actions and links
        flare: "#F87171",    // errors
        pulse: "#34D399",    // success
      },

      // Typography.
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
