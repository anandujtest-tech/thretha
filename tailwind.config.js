/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./app/**/*.{js,jsx}",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.25rem",
        sm: "1.75rem",
        lg: "2.5rem",
        xl: "3.5rem",
        "2xl": "4rem",
      },
      screens: {
        "2xl": "1440px",
      },
    },
    extend: {
      colors: {
        // Vibrant Tropical Indian Haute-Couture Palette
        mango: {
          DEFAULT: "#FF8C38",
          light: "#FFF0E5",
          dark: "#E06A14",
          soft: "#FFD9BE",
        },
        coral: {
          DEFAULT: "#F25C54",
          light: "#FDECEB",
          dark: "#D63F37",
          soft: "#F8A5A0",
        },
        plum: {
          DEFAULT: "#7A2048",
          light: "#F4E8EF",
          dark: "#4A154B",
          soft: "#B85C83",
        },
        teal: {
          DEFAULT: "#1A535C",
          light: "#E6F2F4",
          dark: "#11383E",
          soft: "#4E878F",
        },
        sage: {
          DEFAULT: "#839788",
          light: "#EDF2EE",
          dark: "#5E7063",
          soft: "#B6C3B9",
        },
        marigold: {
          DEFAULT: "#F4A261",
          light: "#FEF4EB",
          dark: "#D77C33",
        },
        paper: {
          DEFAULT: "#FAF7F2",
          subtle: "#F5EFE6",
          warm: "#EDE4D6",
          dark: "#E4D8C7",
        },
        cream: {
          DEFAULT: "#FFFFFF",
          warm: "#FFFDF9",
          soft: "#F9F6F0",
        },
        sand: {
          DEFAULT: "#EDE5D8",
          light: "#F5F0E6",
          dark: "#DED3C1",
        },
        ink: {
          DEFAULT: "#141312",
          soft: "#262321",
          muted: "#4A4541",
          light: "#78716C",
        },
        brown: {
          DEFAULT: "#6A584C",
          dark: "#4B3D34",
          light: "#8C7B6F",
        },
        cocoa: {
          DEFAULT: "#52453C",
          dark: "#3B312A",
          light: "#7A685D",
        },
        gold: {
          DEFAULT: "#C5A059",
          dark: "#96713D",
          light: "#F7F0E4",
          subtle: "#E6D4BA",
          shimmer: "#E5C378",
        },
        terracotta: {
          DEFAULT: "#C85A32",
          dark: "#9A4020",
          light: "#F9ECE7",
        },
        rose: {
          DEFAULT: "#D4ABA1",
          dark: "#B88A7F",
          light: "#F9F0EE",
        },
        beige: {
          DEFAULT: "#E8DFC8",
          light: "#F3EDE0",
          dark: "#D6C9AF",
        },

        // shadcn UI token bindings
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        hand: ["var(--font-caveat)", "cursive"],
      },
      letterSpacing: {
        widest: "0.2em",
        ultra: "0.3em",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        editorial: "0 20px 40px -15px rgba(20, 19, 18, 0.07)",
        card: "0 10px 30px -10px rgba(20, 19, 18, 0.05)",
        floating: "0 30px 60px -20px rgba(20, 19, 18, 0.12)",
        subtle: "0 2px 10px rgba(20, 19, 18, 0.03)",
        glow: "0 0 25px rgba(184, 142, 86, 0.18)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-subtle": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.05)" },
        },
        "slide-down": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "marquee": {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "accordion-up": "accordion-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-up": "fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-down": "slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "marquee": "marquee 25s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
