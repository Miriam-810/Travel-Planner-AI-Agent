// Google Maps settings from frontend/.env.local (see docs/GOOGLE_MAPS_SETUP.md).
export const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID ?? ''
export const hasMapsConfig = Boolean(MAPS_API_KEY && MAP_ID)
