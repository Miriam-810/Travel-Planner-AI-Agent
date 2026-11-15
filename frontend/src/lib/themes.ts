// Per-trip colour palettes. The home page and form always use "sage"; once a
// trip exists, its outline and trip pages switch to the palette Claude picked
// (backend TripTheme). Each palette overrides the CSS colour tokens in index.css.
import { useEffect } from 'react'

export type ThemeName = 'sage' | 'snow' | 'maple' | 'sakura' | 'ocean' | 'summer' | 'city'

interface Palette {
  label: string
  mist: string
  mistDeep: string
  field: string
  line: string
  accent: string
  accentDeep: string
  accentSoft: string
  highlight: string
  ink: string
  inkSoft: string
}

export const THEMES: Record<ThemeName, Palette> = {
  sage: {
    label: '森林綠',
    mist: '#dfe5db', mistDeep: '#d2dacd', field: '#e4e9e0', line: '#d8dfd3',
    accent: '#6e8b69', accentDeep: '#4e6a4a', accentSoft: '#e7eee3', highlight: '#cdeea0',
    ink: '#2e3a2d', inkSoft: '#6e7a6b',
  },
  snow: {
    label: '雪國紅白',
    mist: '#eef0f2', mistDeep: '#e2e6ea', field: '#e9ecef', line: '#dde1e5',
    accent: '#c4433b', accentDeep: '#8f2b25', accentSoft: '#f8e4e1', highlight: '#f6cbc4',
    ink: '#2d2a2a', inkSoft: '#736b6a',
  },
  maple: {
    label: '楓紅',
    mist: '#f0e4d6', mistDeep: '#e8d8c6', field: '#ecdecf', line: '#e3d3c1',
    accent: '#bf5a2f', accentDeep: '#86391b', accentSoft: '#f7e3d3', highlight: '#f3c27c',
    ink: '#3b2a20', inkSoft: '#7d6b5d',
  },
  sakura: {
    label: '櫻花粉',
    mist: '#f4e7ea', mistDeep: '#ecdade', field: '#efdfe4', line: '#e8d3d9',
    accent: '#cc6f87', accentDeep: '#984358', accentSoft: '#fae4ea', highlight: '#f8c8d5',
    ink: '#3a2a2e', inkSoft: '#7c6a6f',
  },
  ocean: {
    label: '海島藍',
    mist: '#d8ecef', mistDeep: '#c9e2e7', field: '#d6e9ed', line: '#c7dee3',
    accent: '#2b8aa1', accentDeep: '#1c6273', accentSoft: '#dbf0f4', highlight: '#a7e6df',
    ink: '#1f3438', inkSoft: '#5f7579',
  },
  summer: {
    label: '盛夏綠',
    mist: '#e1ecd6', mistDeep: '#d4e3c7', field: '#dce8d0', line: '#d0dfc4',
    accent: '#5a9a47', accentDeep: '#3a6b2d', accentSoft: '#e3f1db', highlight: '#d4f08a',
    ink: '#2b3a26', inkSoft: '#6a7a63',
  },
  city: {
    label: '都會夜藍',
    mist: '#e1e3ec', mistDeep: '#d4d7e3', field: '#dcdfea', line: '#d1d5e2',
    accent: '#4b5c9c', accentDeep: '#2f3b70', accentSoft: '#e3e6f4', highlight: '#c9cff6',
    ink: '#262b3d', inkSoft: '#676d82',
  },
}

export function palette(name: string | undefined): Palette {
  return THEMES[(name as ThemeName) ?? 'sage'] ?? THEMES.sage
}

/** Apply a palette to the whole document while the calling page is mounted. */
export function useTheme(name: string | undefined) {
  useEffect(() => {
    const p = palette(name)
    const vars: Record<string, string> = {
      '--color-mist': p.mist,
      '--color-mist-deep': p.mistDeep,
      '--color-field': p.field,
      '--color-line': p.line,
      '--color-sage': p.accent,
      '--color-sage-deep': p.accentDeep,
      '--color-sage-soft': p.accentSoft,
      '--color-lime': p.highlight,
      '--color-ink': p.ink,
      '--color-ink-soft': p.inkSoft,
    }
    const root = document.documentElement.style
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v)
    return () => {
      for (const k of Object.keys(vars)) root.removeProperty(k)
    }
  }, [name])
}
