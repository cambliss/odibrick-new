import type { Config } from 'tailwindcss';

/**
 * Odibrick design tokens.
 *
 * The palette comes from the subject: Indian stamp paper and the registrar's
 * office — deep ledger green, a single ochre used only for verification seals,
 * and a cool paper white. Ochre is never decorative; if it appears, something
 * has actually been verified.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12211C',
        seal: { DEFAULT: '#1F5D4C', deep: '#143F34', soft: '#E7EFEA' },
        ochre: { DEFAULT: '#B8862B', soft: '#F6EEDC' },
        paper: '#F5F6F3',
        line: '#DCE1DC',
        muted: '#5B6B63',
        alert: '#9B3B2E',
        info: '#2C5A78',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        hero: ['clamp(2.75rem, 7vw, 5.25rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        display: ['clamp(1.9rem, 4vw, 3rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.16em' }],
      },
      borderRadius: { card: '4px', pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(18,33,28,0.05), 0 8px 24px -16px rgba(18,33,28,0.25)',
        lift: '0 2px 4px rgba(18,33,28,0.06), 0 18px 40px -24px rgba(18,33,28,0.35)',
      },
      backgroundImage: {
        // the perforated edge used on verification seals
        perforation:
          'radial-gradient(circle at 50% 0, transparent 3px, currentColor 3px)',
      },
    },
  },
  plugins: [],
};

export default config;
