/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 12px 40px rgba(0,0,0,.22)',
      },
    },
  },
  plugins: [],
}
