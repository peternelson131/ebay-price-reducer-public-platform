/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ebay: {
          blue: '#0654ba',
          yellow: '#f5af02',
          red: '#e53238',
          green: '#86bd3b'
        }
      }
    },
  },
  plugins: [],
}