/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          twitter: '#1DA1F2',
          linkedin: '#0A66C2',
          youtube: '#FF0000',
          instagram: '#E1306C',
          tiktok: '#00F2FE',
        }
      }
    },
  },
  plugins: [],
};
