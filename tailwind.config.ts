import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // --font-sans is set by next/font in the root layout; the stack after it covers
        // the moment before the webfont lands.
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        instagram: "#E1306C",
        youtube: "#FF0000",
        facebook: "#1877F2",
        /** The page behind the cards. Warmer than slate-100, which reads cold and flat. */
        canvas: "#F6F7F9",
        /** The sidebar. Near-black neutral rather than navy, so the accent stays the accent. */
        ink: {
          800: "#1E2024",
          900: "#141619",
          950: "#0D0E11",
        },
      },
      /**
       * Two-part shadows: a tight contact shadow plus a wider ambient one. A single blurred
       * shadow is what makes an interface look printed on rather than sitting on the page.
       */
      boxShadow: {
        xs: "0 1px 2px 0 rgb(16 24 40 / 0.04)",
        sm: "0 1px 2px 0 rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.04)",
        DEFAULT: "0 1px 2px 0 rgb(16 24 40 / 0.06), 0 2px 5px -1px rgb(16 24 40 / 0.05)",
        md: "0 2px 4px -2px rgb(16 24 40 / 0.06), 0 4px 10px -2px rgb(16 24 40 / 0.08)",
        lg: "0 4px 6px -2px rgb(16 24 40 / 0.04), 0 12px 20px -4px rgb(16 24 40 / 0.10)",
        xl: "0 8px 10px -6px rgb(16 24 40 / 0.05), 0 24px 40px -8px rgb(16 24 40 / 0.14)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        fade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        pop: {
          from: { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        /** Runs under a bar while a request is in flight, without claiming a percentage. */
        sweep: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
      },
      animation: {
        // `rise` is written by hand in globals.css: it needs a per-item delay from --i,
        // which the shorthand generated here cannot carry.
        fade: "fade 0.2s ease-out both",
        pop: "pop 0.16s cubic-bezier(0.16, 1, 0.3, 1) both",
        sweep: "sweep 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
