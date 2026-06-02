/**
 * En desarrollo, Vite hace proxy de `/api` a uvicorn (ver vite.config.js).
 * En Vercel (o build estático), define `VITE_API_BASE_URL` con la URL pública de la API, sin barra final.
 * Ejemplo: `https://tu-api.onrender.com`
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw == null || String(raw).trim() === '') {
    // Fallback local: evita depender del proxy de Vite para pruebas rápidas.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const host = window.location.hostname
      if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001'
    }
    return ''
  }
  return String(raw).replace(/\/$/, '')
}

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl()}${p}`
}

/** En producción (Vercel) sin VITE_API_BASE_URL las llamadas a /api fallan: el backend no vive en el mismo sitio. */
export function isProductionMissingApiUrl() {
  return Boolean(import.meta.env.PROD) && getApiBaseUrl() === ''
}
