import type { SceneKind, Stop } from '../types'

/** Old trips have no scene: fall back on the stop's kind. */
export function sceneOf(stop: Pick<Stop, 'scene' | 'kind'>): SceneKind {
  return stop.scene ?? (stop.kind === 'meal' ? 'restaurant' : stop.kind === 'shop' ? 'shop' : 'landmark')
}

/** Rough height of each piece, so the pin badge can float just above it. */
export const PIECE_HEIGHT: Record<SceneKind, number> = {
  ramen: 0.72, seafood: 0.68, cafe: 0.44, restaurant: 0.56, shrine: 0.46, temple: 0.8, castle: 0.7,
  onsen: 0.45, museum: 0.42, park: 0.36, nature: 0.46, viewpoint: 0.82, beach: 0.3, street: 0.44,
  market: 0.36, shop: 0.44, station: 0.3, landmark: 0.66,
}
