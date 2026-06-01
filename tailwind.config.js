/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08080E",
          900: "#0E0E18",
          850: "#13131F",
          800: "#191926",
        },
        neon: {
          pink: "#FF3D81",
          violet: "#A855F7",
          cyan: "#22D3EE",
          lime: "#4ADE80",
          gold: "#FBBF24",
        },
        mist: {
          50: "#F4F4FB",
          100: "#D7D7E6",
          300: "#9A9AB4",
          400: "#6E6E88",
        },
      },
      fontFamily: {
        display: ["var(--font-clash)", "system-ui", "sans-serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        gradientShift: {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        floatOrb: {
          "0%, 100%": { transform: "translate(0px, 0px)" },
          "50%": { transform: "translate(20px, -30px)" },
        },
      },
      animation: {
        gradientShift: "gradientShift 8s ease infinite",
        floatOrb: "floatOrb 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
