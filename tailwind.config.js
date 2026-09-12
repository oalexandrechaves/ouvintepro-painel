/** @type {import('tailwindcss').Config} */
// TEMA CLARO DO AtendentePRO.
// Fonte da verdade: AtendentePRO-design-referencia.html. Os tokens tem nome de
// FUNCAO (fundo, borda, texto) e nao de aparencia, para a proxima troca de tema
// mexer so aqui.
// As cores neon do tema escuro (#FF3D81, #A855F7) sairam de proposito: vibram
// sobre branco. Nao reintroduzir.
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fundo: {
          app: "#F6F6F8",
          cartao: "#FFFFFF",
          claro: "#FBFBFC",
          grupo: "#EFEFF3",
          trilho: "#F2F2F6",
          hover: "#F5F5F8",
        },
        borda: {
          cartao: "#E9E9EE",
          divisor: "#F0F0F4",
          campo: "#E4E4EA",
          hover: "#E8D2DE",
        },
        texto: {
          titulo: "#16181D",
          forte: "#4A4D57",
          corpo: "#6E7280",
          rotulo: "#9A9AA6",
          off: "#C1C1CB",
        },
        magenta: {
          DEFAULT: "#D81B60",
          escuro: "#B0164F",
          claro: "#FCE7F0",
        },
        violeta: {
          DEFAULT: "#7C3AED",
          escuro: "#5B21B6",
          claro: "#EDE4FE",
        },
        verde: {
          DEFAULT: "#15803D",
          claro: "#E7F7EC",
        },
        // Ambar entrou com a escala de niveis de acesso (Edicao) e ja serve ao
        // gradiente de alerta do arquivo de referencia.
        ambar: {
          DEFAULT: "#B45309",
          claro: "#FEF3C7",
        },
      },
      fontFamily: {
        display: ["var(--font-clash)", "system-ui", "sans-serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        repouso: "0 1px 2px rgba(20,22,26,0.04)",
        hover: "0 10px 26px rgba(20,22,26,0.08), 0 2px 6px rgba(20,22,26,0.04)",
        modal: "0 18px 48px rgba(20,22,26,0.18)",
        foco: "0 0 0 3px rgba(216,27,96,0.12)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-420px 0" },
          "100%": { backgroundPosition: "420px 0" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        pop: {
          from: { opacity: "0", transform: "translateY(10px) scale(.985)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        shimmer: "shimmer 1.3s linear infinite",
        fadeIn: "fadeIn .35s ease both",
        pop: "pop .24s cubic-bezier(.22,.8,.3,1) both",
      },
    },
  },
  plugins: [],
};
