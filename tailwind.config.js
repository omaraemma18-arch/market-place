/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe6fe', 500: '#3b5bdb', 600: '#2f4bc4', 700: '#263c9e',
        },
      },
    },
  },
  plugins: [],
};
