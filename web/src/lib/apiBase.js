/**
 * En desarrollo, Vite hace proxy de `/api` a uvicorn (ver vite.config.js).
 * En Vercel (o build estático), define `VITE_API_BASE_URL` con la URL pública de la API, sin barra final.
 * Ejemplo: `https://tu-api.onrender.com`
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw == null || String(raw).trim() === '') return ''
  return String(raw).replace(/\/$/, '')
}

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl()}${p}`
}
