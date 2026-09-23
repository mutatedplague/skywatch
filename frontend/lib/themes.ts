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

export const THEMES: Theme[] = [
  {
    id: 'phosphor',
    label: 'p7',
    colors: {
      void: [4, 8, 10],
      console: [8, 17, 20],
      scope: [7, 19, 16],
      bezel: [12, 22, 24],
      hairline: [22, 48, 44],
      hairlineLit: [36, 86, 77],
      strike: [214, 236, 255],
      phosphor: [159, 194, 60],
      phosphorDim: [97, 128, 44],
      phosphorFaint: [51, 68, 28],
      sodium: [255, 179, 64],
      emergency: [255, 74, 51],
      ink: [203, 224, 195],
      inkDim: [120, 141, 116],
      face: [[10, 28, 22], [7, 19, 16], [4, 12, 10]],
    },
  },
  {
    id: 'tron',
    label: 'tron',
    colors: {
      void: [2, 8, 12],
      console: [5, 17, 26],
      scope: [4, 18, 28],
      bezel: [8, 24, 36],
      hairline: [14, 56, 78],
      hairlineLit: [26, 104, 140],
      strike: [222, 248, 255],
      phosphor: [106, 214, 255],
      phosphorDim: [52, 132, 170],
      phosphorFaint: [22, 66, 88],
      sodium: [255, 176, 72],
      emergency: [255, 70, 90],
      ink: [186, 226, 244],
      inkDim: [96, 140, 164],
      face: [[6, 28, 44], [4, 18, 28], [2, 10, 16]],
    },
  },
  {
    id: 'matrix',
    label: 'matrix',
    colors: {
      void: [2, 8, 4],
      console: [5, 18, 9],
      scope: [4, 20, 10],
      bezel: [8, 26, 14],
      hairline: [16, 60, 28],
      hairlineLit: [28, 110, 52],
      strike: [226, 255, 232],
      phosphor: [64, 245, 110],
      phosphorDim: [34, 142, 64],
      phosphorFaint: [16, 70, 32],
      sodium: [240, 208, 72],
      emergency: [255, 72, 64],
      ink: [176, 240, 190],
      inkDim: [88, 148, 104],
      face: [[6, 30, 14], [4, 20, 10], [2, 12, 6]],
    },
  },
  {
    id: 'amber',
    label: 'amber',
    colors: {
      void: [10, 6, 2],
      console: [22, 14, 5],
      scope: [24, 15, 5],
      bezel: [30, 20, 8],
      hairline: [68, 44, 14],
      hairlineLit: [122, 80, 26],
      strike: [255, 242, 214],
      phosphor: [255, 178, 54],
      phosphorDim: [168, 112, 30],
      phosphorFaint: [84, 56, 16],
      sodium: [255, 226, 130],
      emergency: [255, 84, 52],
      ink: [242, 208, 150],
      inkDim: [156, 120, 74],
      face: [[36, 22, 8], [24, 15, 5], [14, 9, 3]],
    },
  },
  {
    id: 'redalert',
    label: 'alert',
    colors: {
      void: [10, 3, 4],
      console: [24, 7, 9],
      scope: [26, 8, 10],
      bezel: [32, 11, 13],
      hairline: [78, 22, 26],
      hairlineLit: [134, 40, 46],
      strike: [255, 224, 226],
      phosphor: [255, 92, 96],
      phosphorDim: [166, 54, 58],
      phosphorFaint: [84, 26, 30],
      sodium: [255, 186, 96],
      emergency: [255, 236, 120],
      ink: [246, 190, 192],
      inkDim: [160, 98, 102],
      face: [[40, 12, 14], [26, 8, 10], [15, 5, 6]],
    },
  },
  {
    id: 'interstellar',
    label: 'ice',
    colors: {
      void: [5, 7, 11],
      console: [12, 16, 24],
      scope: [12, 17, 26],
      bezel: [18, 24, 34],
      hairline: [42, 54, 74],
      hairlineLit: [78, 98, 130],
      strike: [255, 255, 255],
      phosphor: [206, 226, 255],
      phosphorDim: [124, 146, 186],
      phosphorFaint: [58, 72, 100],
      sodium: [255, 196, 108],
      emergency: [255, 96, 96],
      ink: [216, 228, 248],
      inkDim: [130, 146, 176],
      face: [[20, 28, 42], [12, 17, 26], [6, 9, 14]],
    },
  },
];

export const DEFAULT_THEME = 'phosphor';

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
