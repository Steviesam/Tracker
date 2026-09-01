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
      },
    },
  },
  plugins: [],
} satisfies Config;
