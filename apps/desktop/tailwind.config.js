/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0b0b0b',
        surface: '#141414',
        'surface-elevated': '#1c1c1c',
        'surface-hover': '#242424',
        border: '#222222',
        'border-light': '#2e2e2e',
      },
    },
  },
  plugins: [],
};
