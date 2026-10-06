import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#2f7cf6',
          600: '#1d63db',
          700: '#1a4fb1',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
