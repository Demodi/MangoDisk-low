/**
 * UnoCSS backup-branch config for MangoDisk.
 *
 * Drop-in replacement for tailwind.config.cjs: same 46 semantic colour tokens
 * (mapped to oklch(var(--<token>-ch) / <alpha-value>)), same font/border/ring/
 * shadow/opacity scales, plus a data-theme-aware dark/light variant and an
 * aria-invalid variant that mirror the Tailwind v3 setup.
 *
 * Why the custom dark/light variants: @unocss/preset-wind3 hard-codes the
 * `.dark` / `.light` CLASS selectors (variantMatcher(".dark", ...)). MangoDisk
 * applies dark mode via the `[data-theme="dark"]` attribute (Tailwind v3
 * `darkMode: ['selector', '[data-theme="dark"]']`), so we strip wind3's
 * built-in dark/light variants and register our own that emit
 * `[data-theme="dark"]` / `[data-theme="light"]` ancestor selectors instead.
 *
 * Safari 15.6.1 safety: no @property, no color-mix in this pipeline; opacity is
 * done with the oklch-alpha channel variables (zero gamut clipping). autoprefixer
 * (still wired in vite's css.postcss) supplies -webkit-backdrop-filter.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import {
  defineConfig,
  presetWind3,
  transformerDirectives,
  type Preset,
} from 'unocss'
import { presetAnimations } from 'unocss-preset-animations'

/**
 * Tailwind v3 scans its `content` globs as raw text, so class names composed
 * inside JS helpers (`cn('peer ring-3 aria-invalid:...')` in shadcn-vue style
 * SFC scripts) are always seen. @unocss/vite by default only sees Vite's module
 * graph, and its `content.filesystem` path still passes every file through the
 * pipeline filter, which silently drops those candidates. `content.inline` is
 * the one path that feeds raw source straight to the extractor, so we mirror
 * the v3 globs here and hand the concatenated source to UnoCSS.
 */
function readSources(root: string): string {
  const extensions = new Set(['.vue', '.js', '.ts', '.jsx', '.tsx', '.html'])
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === '.git') continue
      const file = join(dir, name)
      if (statSync(file).isDirectory()) walk(file)
      else if (extensions.has(extname(name))) files.push(file)
    }
  }
  walk(join(root, 'src'))
  for (const entry of ['index.html', 'floating-monitor.html', 'tray-panel.html', 'memory-settings.html']) {
    const file = join(root, entry)
    if (existsSync(file)) files.push(file)
  }
  return files.map((file) => readFileSync(file, 'utf8')).join('\n')
}

const colorTokens = [
  'background', 'workspace', 'foreground', 'card', 'card-foreground',
  'popover', 'popover-foreground', 'primary', 'primary-text',
  'primary-text-subtle', 'primary-text-hover', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-text',
  'destructive-foreground', 'success', 'success-foreground', 'warning',
  'usage-warning', 'usage-critical', 'warning-foreground', 'border', 'input',
  'ring', 'sidebar', 'sidebar-foreground', 'sidebar-accent',
  'sidebar-accent-foreground', 'sidebar-border', 'chart-1', 'chart-2',
  'chart-3', 'chart-4', 'chart-5', 'file-code', 'file-audio', 'file-image',
  'file-data', 'file-package', 'file-binary',
] as const

const colors = Object.fromEntries(
  colorTokens.map((n) => [n, `oklch(var(--${n}-ch) / <alpha-value>)`]),
)

const fontTokens = [
  'content-empty-title', 'content-section-title', 'content-primary',
  'content-body', 'content-secondary', 'content-meta',
] as const
const fontSize = Object.fromEntries(fontTokens.map((n) => [n, `var(--font-${n})`]))

/** wind3 preset with its hard-coded `.dark` / `.light` class variants removed
 *  and replaced by `[data-theme="dark"]` / `[data-theme="light"]` variants. */
function wind3DataTheme(): Preset {
  const w3 = presetWind3()
  const filtered = w3.variants.filter(
    (v) => !['dark', '.dark', 'light', '.light'].includes(v.name as string),
  )
  const customDark = {
    name: 'dark',
    match(matcher: string) {
      if (!matcher.startsWith('dark:')) return
      return {
        matcher: matcher.slice(5),
        handle: (input: any, next: any) =>
          next({ ...input, prefix: `[data-theme="dark"] $$ ${input.prefix}` }),
      }
    },
  }
  const customLight = {
    name: 'light',
    match(matcher: string) {
      if (!matcher.startsWith('light:')) return
      return {
        matcher: matcher.slice(6),
        handle: (input: any, next: any) =>
          next({ ...input, prefix: `[data-theme="light"] $$ ${input.prefix}` }),
      }
    },
  }
  // Tailwind v3 `addVariant('aria-invalid', '&[aria-invalid="true"]')` equivalent.
  const ariaInvalid = {
    name: 'aria-invalid',
    match(matcher: string) {
      if (!matcher.startsWith('aria-invalid:')) return
      return {
        matcher: matcher.slice('aria-invalid:'.length),
        handle: (input: any, next: any) =>
          next({ ...input, selector: `${input.selector}[aria-invalid="true"]` }),
      }
    },
  }
  return {
    ...w3,
    name: 'wind3-datatheme',
    variants: [...filtered, customDark, customLight, ariaInvalid],
  }
}

const w3base = presetWind3()

export default defineConfig({
  presets: [wind3DataTheme(), presetAnimations()],
  transformers: [transformerDirectives()],
  // Raw-text scan equivalent to Tailwind v3's `content` globs. See readSources().
  content: {
    inline: [readSources(process.cwd())],
  },
  theme: {
    colors: { ...(w3base.theme.colors as Record<string, string>), ...colors },
    fontSize: { ...(w3base.theme.fontSize as Record<string, any>), ...fontSize },
    borderRadius: {
      ...(w3base.theme.borderRadius as Record<string, string>),
      sm: 'calc(var(--radius) - 4px)',
      md: 'calc(var(--radius) - 2px)',
      lg: 'var(--radius)',
      xl: 'calc(var(--radius) + 4px)',
    },
    boxShadow: {
      ...(w3base.theme.boxShadow as Record<string, string>),
      xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    },
    ringWidth: { ...(w3base.theme.ringWidth as Record<string, string>), 3: '3px' },
    opacity: { ...(w3base.theme.opacity as Record<string, string>), 12: '0.12', 38: '0.38' },
  },
})
