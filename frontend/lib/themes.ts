/**
 * The console's look: a mode (dark or light) and an accent. One palette
 * drives the CSS custom properties, the terrain painting and the 3D scene's
 * materials, so switching either recolours the whole console rather than
 * just its chrome.
 *
 * This module is the single source of truth. Tailwind's @theme block in
 * globals.css seeds the dark defaults; applyTheme overrides the same custom
 * properties on :root at runtime, and the canvas layers read the numeric
 * triples straight from here. It is deliberately not a client module: the
 * root layout imports it on the server to inline a script that applies the
 * stored look before first paint, so a light-mode console never flashes dark.
 */

export type RGB = [number, number, number];
export type Mode = 'dark' | 'light';

export interface ThemeColors {
  void: RGB;
  console: RGB;
  bezel: RGB;
  hairline: RGB;
  hairlineLit: RGB;
  /** The locked contact and its reticle: the one colour above the accent. */
  strike: RGB;
  phosphor: RGB;
  phosphorDim: RGB;
  phosphorFaint: RGB;
  /** Alert amber and emergency red stay semantic across every accent. */
  sodium: RGB;
  emergency: RGB;
  ink: RGB;
  inkDim: RGB;
}

export interface Theme {
  id: string;
  label: string;
  mode: Mode;
  colors: ThemeColors;
}

/**
 * The chrome is achromatic in both modes. Only the accent carries meaning: it
 * marks what is active and it paints ordinary contacts in the scene. Amber
 * and red are fixed per mode, so a warning reads the same whatever accent is
 * chosen; the light-mode pair is a touch deeper to hold up on a pale ground.
 */
const BASE: Record<Mode, Omit<ThemeColors, 'phosphor' | 'phosphorDim' | 'phosphorFaint'>> = {
  dark: {
    void: [0, 0, 0],
    console: [12, 13, 15],
    bezel: [18, 19, 22],
    hairline: [36, 38, 42],
    hairlineLit: [62, 65, 71],
    strike: [255, 255, 255],
    sodium: [255, 176, 32],
    emergency: [255, 77, 77],
    ink: [233, 235, 238],
    inkDim: [124, 130, 140],
  },
  light: {
    void: [246, 247, 249],
    console: [255, 255, 255],
    bezel: [238, 240, 243],
    hairline: [216, 219, 225],
    hairlineLit: [184, 189, 197],
    strike: [17, 19, 23],
    sodium: [205, 128, 0],
    emergency: [217, 38, 38],
    ink: [20, 22, 26],
    inkDim: [104, 110, 120],
  },
};

/**
 * Accents, as the full-strength colour in each mode. The dark set is the
 * phosphor family the console started with; the light set is the same hue
 * taken deep enough to read against near-white. Neutral is the ink itself.
 */
const ACCENTS: Array<{ id: string; label: string; dark: RGB | null; light: RGB | null }> = [
  { id: 'green', label: 'green', dark: [159, 194, 60], light: [84, 118, 18] },
  { id: 'blue', label: 'blue', dark: [76, 141, 246], light: [31, 92, 212] },
  { id: 'cyan', label: 'cyan', dark: [41, 182, 200], light: [12, 125, 140] },
  { id: 'violet', label: 'violet', dark: [139, 127, 240], light: [92, 76, 205] },
  { id: 'neutral', label: 'neutral', dark: null, light: null },
];

export const DEFAULT_THEME = 'green';
export const DEFAULT_MODE: Mode = 'dark';

/** Where this browser keeps its own look. Shared with the pre-paint script. */
export const THEME_KEY = 'skywatch.theme';
export const MODE_KEY = 'skywatch.mode';

/** The accents as a control's options, labelled for the interface. */
export const THEME_OPTIONS: Array<{ value: string; label: string }> = ACCENTS.map((accent) => ({
  value: accent.id,
  label: accent.label.charAt(0).toUpperCase() + accent.label.slice(1),
}));

export const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function isMode(value: unknown): value is Mode {
  return value === 'dark' || value === 'light';
}

/** Linear blend of a toward b: 0 is a, 1 is b. */
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function themeById(id: string, mode: Mode = DEFAULT_MODE): Theme {
  const accent = ACCENTS.find((entry) => entry.id === id) ?? (ACCENTS[0] as (typeof ACCENTS)[number]);
  const base = BASE[mode];
  const full = accent[mode];
  // Dim and faint are the accent sinking toward the background, so a dimmed
  // control reads as quieter rather than as a different colour.
  const colors: ThemeColors = full
    ? {
        ...base,
        phosphor: full,
        phosphorDim: mix(full, base.void, 0.4),
        phosphorFaint: mix(full, base.void, 0.68),
      }
    : { ...base, phosphor: base.ink, phosphorDim: base.inkDim, phosphorFaint: base.hairlineLit };
  return { id: accent.id, label: accent.label, mode, colors };
}

/** The palette the canvas layers paint with. Updated by applyTheme. */
let active: Theme = themeById(DEFAULT_THEME, DEFAULT_MODE);

export function palette(): ThemeColors {
  return active.colors;
}

export function activeMode(): Mode {
  return active.mode;
}

export function rgbHex(c: RGB): number {
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

export function rgbCss(c: RGB): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Custom property name for each palette entry Tailwind consumes. */
const CSS_VARS: Array<[keyof ThemeColors, string]> = [
  ['void', '--color-void'],
  ['console', '--color-console'],
  ['bezel', '--color-bezel'],
  ['hairline', '--color-hairline'],
  ['hairlineLit', '--color-hairline-lit'],
  ['strike', '--color-strike'],
  ['phosphor', '--color-phosphor'],
  ['phosphorDim', '--color-phosphor-dim'],
  ['phosphorFaint', '--color-phosphor-faint'],
  ['sodium', '--color-sodium'],
  ['emergency', '--color-emergency'],
  ['ink', '--color-ink'],
  ['inkDim', '--color-ink-dim'],
];

function cssVariables(colors: ThemeColors): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, variable] of CSS_VARS) variables[variable] = rgbCss(colors[key]);
  return variables;
}

function paint(root: HTMLElement, theme: Theme): void {
  for (const [variable, value] of Object.entries(cssVariables(theme.colors))) {
    root.style.setProperty(variable, value);
  }
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  // Native controls, scrollbars and the browser's own chrome follow suit.
  root.style.colorScheme = theme.mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', rgbCss(theme.colors.void));
}

export function applyTheme(id: string, mode: Mode = DEFAULT_MODE): Theme {
  const theme = themeById(id, mode);
  active = theme;
  if (typeof document !== 'undefined') paint(document.documentElement, theme);
  return theme;
}

/** The mode this browser would rather have, when nothing has been chosen. */
export function preferredMode(): Mode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return DEFAULT_MODE;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Source for an inline script that applies the stored look before the page
 * first paints. It carries every palette as data, so the CSS never has to
 * repeat what this module already says.
 */
export function bootScript(): string {
  const table: Record<Mode, Record<string, Record<string, string>>> = { dark: {}, light: {} };
  for (const mode of ['dark', 'light'] as const) {
    for (const accent of ACCENTS) table[mode][accent.id] = cssVariables(themeById(accent.id, mode).colors);
  }
  return (
    `(function(){try{var t=${JSON.stringify(table)};` +
    `var m=localStorage.getItem(${JSON.stringify(MODE_KEY)});` +
    `if(m!=='dark'&&m!=='light'){m=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}` +
    `var a=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
    `var v=t[m][a]||t[m][${JSON.stringify(DEFAULT_THEME)}];var r=document.documentElement;` +
    `for(var k in v){r.style.setProperty(k,v[k])}r.style.colorScheme=m;r.dataset.mode=m;}catch(e){}})();`
  );
}
