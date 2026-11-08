/**
 * Vite runs this PostCSS config for every CSS entry and every Vue SFC style
 * block, which is what makes `@apply` work in scoped component styles under
 * Tailwind v3 (no `@reference` directive is needed any more).
 *
 * CSS `@import` resolution is left to Vite's own CSS pipeline on purpose:
 * adding postcss-import here would inline theme files twice.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
