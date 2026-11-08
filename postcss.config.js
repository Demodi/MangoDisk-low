/**
 * Vite runs this PostCSS config for every CSS entry and every Vue SFC style
 * block. Under the UnoCSS backup engine the Tailwind v3 plugin is gone; only
 * autoprefixer remains so that `-webkit-backdrop-filter` (required by Safari
 * 15.6.1, which has no unprefixed `backdrop-filter`) is emitted alongside the
 * standard property. CSS `@import` resolution is left to Vite's own pipeline.
 */
export default {
  plugins: {
    autoprefixer: {},
  },
};
