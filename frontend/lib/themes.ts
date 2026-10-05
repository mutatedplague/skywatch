'use client';

/**
 * Console themes, in the spirit of eDEX-UI: one palette drives the CSS custom
 * properties, the 2D scope's canvas painting and the 3D hologram's materials,
 * so switching theme recolours the whole console rather than just its chrome.
 *
 * This module is the single source of truth. Tailwind's @theme block in
 * globals.css seeds the default values; applyTheme overrides the same custom
 * properties on :root at runtime, and the canvas layers read the numeric
 * triples straight from here.
 */

export type RGB = [number, number, number];

export interface ThemeColors {
  void: RGB;
  console: RGB;
  scope: RGB;
  bezel: RGB;
  hairline: RGB;
  hairlineLit: RGB;
  /** The bright leading edge of the sweep, and lock reticles. */
  strike: RGB;
  phosphor: RGB;
  phosphorDim: RGB;
  phosphorFaint: RGB;
  /** Alert amber and emergency red stay semantic across every theme. */
  sodium: RGB;
  emergency: RGB;
  ink: RGB;
  inkDim: RGB;
  /** Three radial stops painted under the 2D scope face. */
  face: [RGB, RGB, RGB];
}

export interface Theme {
  id: string;
  label: string;
  colors: ThemeColors;
}

/**
 * The chrome is the same achromatic base in every theme. Only the accent
 * changes, because the accent is the one thing carrying meaning: it marks what
 * is active and it paints ordinary contacts on the scope. Alert amber and
 * emergency red are deliberately fixed, so a warning reads the same whatever
 * accent is chosen.
 */
const BASE: Omit<ThemeColors, 'phosphor' | 'phosphorDim' | 'phosphorFaint'> = {
  void: [0, 0, 0],
  console: [12, 13, 15],
  scope: [0, 0, 0],
  bezel: [18, 19, 22],
  hairline: [36, 38, 42],
  hairlineLit: [62, 65, 71],
  strike: [255, 255, 255],
  sodium: [255, 176, 32],
  emergency: [255, 77, 77],
  ink: [233, 235, 238],
  inkDim: [124, 130, 140],
  /* The scope face is flat black: a gradient would be decoration. */
  face: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
};

export const THEMES: Theme[] = [
  {
    id: 'green',
    label: 'green',
    colors: {
      ...BASE,
      phosphor: [159, 194, 60],
      phosphorDim: [95, 116, 39],
      phosphorFaint: [51, 64, 26],
    },
  },
  {
    id: 'blue',
    label: 'blue',
    colors: {
      ...BASE,
      phosphor: [76, 141, 246],
      phosphorDim: [45, 84, 148],
      phosphorFaint: [25, 46, 82],
    },
  },
  {
    id: 'cyan',
    label: 'cyan',
    colors: {
      ...BASE,
      phosphor: [41, 182, 200],
      phosphorDim: [24, 109, 120],
      phosphorFaint: [13, 60, 66],
    },
  },
  {
    id: 'violet',
    label: 'violet',
    colors: {
      ...BASE,
      phosphor: [139, 127, 240],
      phosphorDim: [83, 76, 144],
      phosphorFaint: [46, 42, 80],
    },
  },
  {
    id: 'neutral',
    label: 'neutral',
    colors: {
      ...BASE,
      phosphor: [233, 235, 238],
      phosphorDim: [124, 130, 140],
      phosphorFaint: [62, 65, 71],
    },
  },
];

export const DEFAULT_THEME = 'green';

/** The palettes as a control's options, labelled for the interface. */
export const THEME_OPTIONS: Array<{ value: string; label: string }> = THEMES.map((theme) => ({
  value: theme.id,
  label: theme.label.charAt(0).toUpperCase() + theme.label.slice(1),
}));

export function themeById(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? (THEMES[0] as Theme);
}

/** The palette the canvas layers paint with. Updated by applyTheme. */
let active: ThemeColors = (THEMES[0] as Theme).colors;
let activeId = DEFAULT_THEME;

export function palette(): ThemeColors {
  return active;
}

export function activeThemeId(): string {
  return activeId;
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
  ['scope', '--color-scope'],
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

export function applyTheme(id: string): Theme {
  const theme = themeById(id);
  active = theme.colors;
  activeId = theme.id;

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    for (const [key, variable] of CSS_VARS) {
      root.style.setProperty(variable, rgbCss(theme.colors[key] as RGB));
    }
    root.dataset.theme = theme.id;
  }
  return theme;
}
