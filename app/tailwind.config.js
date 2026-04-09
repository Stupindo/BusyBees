/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#fbbf24', // Amber-400 (The Honey)
          light: '#fcd34d',
          dark: '#f59e0b',
        },
        secondary: {
          DEFAULT: '#1c1917', // Stone-900 (The Bee stripes)
          light: '#292524',
          dark: '#0c0a09',
        },
        accent: {
          DEFAULT: '#84cc16', // Lime-500 (The Meadow/Nature)
          light: '#a3e635',
          dark: '#65a30d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
