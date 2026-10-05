/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0D1117",      // page background
        surface: "#161B22",  // cards and inputs, one step above the background
        raised: "#1C2230",   // card headers
        line: "#30363D",     // borders
        signal: "#58A6FF",   // primary actions and links
        flare: "#F85149",    // errors
        pulse: "#3FB950",    // success
        amber: "#D29922",    // warnings
        muted: "#9BA7B8",
        
        "line-strong": "#57616F",
      },

      // Typography
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
