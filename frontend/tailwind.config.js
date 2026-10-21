/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        amyb: {
          blue: '#0B3C73',
          'blue-dark': '#07264A',
          'blue-deep': '#051C36',
          orange: '#F58220',
          'orange-hover': '#E07113',
          'orange-light': '#FFF6ED',
        },
      },
      fontFamily: {
        sans: ['"Manrope"', 'system-ui', 'sans-serif'],
        display: ['"Manrope"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
