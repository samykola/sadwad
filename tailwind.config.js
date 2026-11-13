module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1f1f1e',
        side: '#1a1a19',
        line: '#2c2c2a',
        hover: '#2a2a28',
        active: '#323230',
        text: '#ececea',
        muted: '#9b9a95',
        box: '#2b2b29',
        boxline: '#3b3b38',
        accent: '#d97757',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', '-apple-system', 'Tahoma', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
      }
    }
  },
  plugins: [],
};