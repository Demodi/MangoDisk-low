/**
 * Generates src/assets/themes/alpha-channels.css.
 *
 * Tailwind v3 needs a color value with an <alpha-value> slot to build `/NN`
 * utilities. Theme files store complete `oklch(L C H)` colors in semantic
 * custom properties, which cannot be split into channels at runtime.
 * This script resolves each theme block's variable chain and emits a parallel
 * `--<token>-ch: L C H` set. Tailwind is then configured with
 * `oklch(var(--<token>-ch) / <alpha-value>)`.
 *
 * Safari 15.4+ supports oklch() (including slash alpha); color-mix() (16.2+)
 * and @property (16.4+) are deliberately not used. Original theme values are
 * left untouched, so no sRGB gamut clipping / colour shift is introduced.
 *
 * Run: node scripts/generate-alpha-channels.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const THEME_DIR = join(ROOT, 'src/assets/themes');
const MAIN_CSS = join(ROOT, 'src/assets/main.css');
const OUTPUT = join(THEME_DIR, 'alpha-channels.css');

// ---------- theme token names taken from the v4 @theme inline block ----------
const mainCss = readFileSync(MAIN_CSS, 'utf8');
const themeInline = mainCss.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const colorTokens = [...themeInline.matchAll(/--color-([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)]
  .map((m) => ({ name: m[1], cssVar: m[2] }));
if (colorTokens.length === 0) throw new Error('No --color-* tokens found in main.css');

// ---------- minimal CSS block parser (top-level rules only) ----------
function parseBlocks(file) {
  const text = readFileSync(join(THEME_DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = text.split('\n');
  const blocks = [];
  let pending = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const brace = trimmed.indexOf('{');
    if (brace >= 0 && !trimmed.startsWith('@')) {
      const selector = [...pending, trimmed.slice(0, brace).trim()].join(' ').trim();
      const body = [];
      let depth = 1 + (trimmed.slice(brace + 1).match(/{/g) || []).length;
      depth -= (trimmed.slice(brace + 1).match(/}/g) || []).length;
      body.push(trimmed.slice(brace + 1));
      while (depth > 0 && i + 1 < lines.length) {
        i++;
        const inner = lines[i];
        depth += (inner.match(/{/g) || []).length - (inner.match(/}/g) || []).length;
        body.push(depth > 0 ? inner : inner.replace(/}[\s\S]*$/, ''));
      }
      const vars = {};
      for (const line of body) {
        const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/);
        if (m) vars[m[1]] = m[2].trim();
      }
      if (Object.keys(vars).length) blocks.push({ file, selector, vars });
      pending = [];
      continue;
    }
    if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('}')) {
      pending = [];
    } else if (!trimmed.includes(':') || trimmed.endsWith(',')) {
      pending.push(trimmed);
    } else {
      pending = [];
    }
  }
  return blocks;
}

// ---------- colour helpers ----------
const r4 = (n) => Number(n.toFixed(4)).toString();

function hexToLinear(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length === 4) h = h.slice(0, 3);
  if (h.length !== 6) return null;
  const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return [0, 2, 4].map((i) => decode(parseInt(h.slice(i, i + 2), 16) / 255));
}

function linearToOklchChannels([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.hypot(a, bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return `${r4(L)} ${r4(C)} ${r4(H)}`;
}

function valueToChannels(value) {
  const v = value.trim();
  const oklch = v.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i);
  if (oklch) {
    const L = oklch[1].includes('%') || Number(oklch[1]) > 1 ? Number(oklch[1]) / 100 : Number(oklch[1]);
    return `${r4(L)} ${r4(Number(oklch[2]))} ${r4(Number(oklch[3]))}`;
  }
  if (v.startsWith('#')) {
    const linear = hexToLinear(v);
    return linear ? linearToOklchChannels(linear) : null;
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) {
    const decode = (x) => (Number(x) <= 1 ? Number(x) : Number(x) / 255);
    const linear = [decode(rgb[1]), decode(rgb[2]), decode(rgb[3])].map((x) =>
      x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    );
    return linearToOklchChannels(linear);
  }
  return null;
}

function resolveChannels(cssVar, table, seen = new Set()) {
  const key = `--${cssVar.replace(/^--/, '')}`;
  if (seen.has(key)) return null;
  const value = table[key];
  if (!value) return null;
  const direct = valueToChannels(value);
  if (direct) return direct;
  const ref = value.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/);
  if (ref) return resolveChannels(ref[1], table, new Set([...seen, key]));
  return null;
}

// ---------- build each theme scope ----------
const baseBlocks = parseBlocks('base-tokens.css');
const globalVars = { ...(baseBlocks[0]?.vars ?? {}) };
const scopes = [];

// `:root:not([data-color-theme])` in mango.css already covers the state before
// a theme is chosen, so no separate bare :root scope is needed. base-tokens.css
// only holds brand artwork colours and shared typography, not surface tokens.
for (const file of ['mango.css', 'warm-gray.css']) {
  const blocks = parseBlocks(file);
  if (blocks.length === 0) throw new Error(`No theme blocks parsed from ${file}`);
  let previous = { ...globalVars };
  for (const block of blocks) {
    const table = { ...previous, ...block.vars };
    scopes.push({ selector: block.selector, table, note: file });
    previous = table;
  }
}

// ---------- emit ----------
const unresolved = [];
const out = [
  '/*',
  ' * GENERATED FILE - do not edit by hand.',
  ' * Regenerate with: node scripts/generate-alpha-channels.mjs',
  ' *',
  ' * OKLCH channel twins for Tailwind v3 alpha utilities (`/NN`).',
  ' * Safari 15.6.1 supports oklch() (15.4+) but not color-mix() (16.2+)',
  ' * nor @property (16.4+); v3 emits `oklch(var(--x-ch) / 0.2)` instead.',
  ' * Channel values are derived from the theme files without sRGB conversion,',
  ' * so wide-gamut OKLCH colours keep their exact hue and chroma.',
  ' */',
  '',
];

for (const scope of scopes) {
  const lines = [];
  for (const { name, cssVar } of colorTokens) {
    const channels = resolveChannels(cssVar, scope.table);
    if (!channels) {
      unresolved.push(`${scope.selector} :: ${name} (var ${cssVar})`);
      continue;
    }
    lines.push(`  --${cssVar}-ch: ${channels};`);
  }
  out.push(`/* ${scope.note} */`);
  out.push(`${scope.selector} {`);
  out.push(...lines);
  out.push('}', '');
}

writeFileSync(OUTPUT, out.join('\n'), 'utf8');
console.log(`wrote ${OUTPUT}`);
console.log(`tokens=${colorTokens.length} scopes=${scopes.length} declarations=${scopes.reduce((n, s) => n + colorTokens.length, 0) - unresolved.length}`);
if (unresolved.length) {
  console.log(`UNRESOLVED=${unresolved.length}`);
  unresolved.slice(0, 30).forEach((x) => console.log('  ' + x));
  process.exitCode = 1;
}
