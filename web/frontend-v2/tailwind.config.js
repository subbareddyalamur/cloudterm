export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      transitionDuration: {
        '180': '180ms',
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elev: 'var(--elev)',
        border: 'var(--border)',
        'border-2': 'var(--border-2)',
        'text-pri': 'var(--text-pri)',
        'text-mut': 'var(--text-mut)',
        'text-dim': 'var(--text-dim)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        info: 'var(--info)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius, 6px)',
        sm: 'var(--radius-sm, 4px)',
        lg: 'var(--radius-lg, 10px)',
      },
    },
  },
  plugins: [],
};
