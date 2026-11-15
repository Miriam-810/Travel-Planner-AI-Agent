// Island colours per trip theme (see lib/themes.ts). Kept separate from the
// page palette: 3D surfaces need their own lighter/darker pairs to read well
// under flat shading.
import type { ThemeName } from '../lib/themes'

export type Foliage = 'pine' | 'round' | 'palm' | 'block'

export interface Palette3D {
  skyTop: string
  skyBottom: string
  grass: string
  grassEdge: string
  rock: string
  rockDark: string
  path: string
  foliage: Foliage
  leaves: string[]
  trunk: string
  roof: string
  wall: string
  water: string
  accent: string
  ink: string
}

const BASE = {
  rock: '#c58b66',
  rockDark: '#a8714f',
  trunk: '#7a5a43',
  wall: '#faf6ee',
  ink: '#2e3a2d',
}

export const PALETTES_3D: Record<ThemeName, Palette3D> = {
  sage: {
    ...BASE, skyTop: '#e9efe4', skyBottom: '#cfdcc9', grass: '#a3c283', grassEdge: '#88a96b',
    path: '#e8dcc2', foliage: 'round', leaves: ['#6e8b69', '#86a96a', '#5d7a58'], roof: '#5f9e9a',
    water: '#8fb8c9', accent: '#6e8b69',
  },
  snow: {
    ...BASE, skyTop: '#f4f6f8', skyBottom: '#dce3ea', grass: '#f7f8fa', grassEdge: '#dfe5ec',
    path: '#e7e2dc', foliage: 'pine', leaves: ['#3f6b55', '#4f7c63', '#365e4a'], roof: '#c4433b',
    water: '#9cc0d4', accent: '#c4433b', rock: '#b9a59a', rockDark: '#9a8679',
  },
  maple: {
    ...BASE, skyTop: '#f7ece0', skyBottom: '#ecd6bf', grass: '#c9b87a', grassEdge: '#b39f63',
    path: '#efe0c8', foliage: 'round', leaves: ['#d0552c', '#e3863a', '#b8402a', '#efb04a'], roof: '#7a4a35',
    water: '#8fb3bf', accent: '#bf5a2f',
  },
  sakura: {
    ...BASE, skyTop: '#f9eef1', skyBottom: '#efd9df', grass: '#b5cf8f', grassEdge: '#9bb878',
    path: '#f0e2d8', foliage: 'round', leaves: ['#f3b3c4', '#ec9db2', '#f8cad6'], roof: '#8a5a6a',
    water: '#a3c4d6', accent: '#cc6f87',
  },
  ocean: {
    ...BASE, skyTop: '#e3f4f6', skyBottom: '#bfe2e8', grass: '#9fd18c', grassEdge: '#f1e1b6',
    path: '#f6e8c4', foliage: 'palm', leaves: ['#3f9c6e', '#56b07f', '#2f8a5f'], roof: '#2b8aa1',
    water: '#4fb6c9', accent: '#2b8aa1', rock: '#d9b98c', rockDark: '#c29f72',
  },
  summer: {
    ...BASE, skyTop: '#ecf5e2', skyBottom: '#cfe5bd', grass: '#8ec96d', grassEdge: '#73b057',
    path: '#ebdfc0', foliage: 'round', leaves: ['#4f9a3e', '#69b04f', '#3b7f2e'], roof: '#d8873f',
    water: '#7cc3d6', accent: '#5a9a47',
  },
  city: {
    ...BASE, skyTop: '#e8eaf3', skyBottom: '#c9cee3', grass: '#a9bba0', grassEdge: '#90a487',
    path: '#d9d8de', foliage: 'block', leaves: ['#8d99c2', '#a7b0d4', '#6f7cab', '#d9c48e'], roof: '#4b5c9c',
    water: '#8aa6c9', accent: '#4b5c9c', rock: '#a99a92', rockDark: '#8c7d75',
  },
}

export function palette3d(theme: string | undefined): Palette3D {
  return PALETTES_3D[(theme as ThemeName) ?? 'sage'] ?? PALETTES_3D.sage
}
