# Despliegue: GitHub + Vercel (frontend) + API (FastAPI)

## Estructura recomendada en Git

Usa la carpeta `automation` como **raíz del repositorio** (o ajusta en Vercel/CI el directorio `web`).

- `web/` — React + Vite (se despliega en Vercel)
- `api/`, `informe_builder.py`, `progress_dashboard.py` — FastAPI (no se ejecuta en Vercel de forma sencilla; despliégala aparte)

## 1) Frontend en Vercel

1. Crea un proyecto en [Vercel](https://vercel.com) e importa el repositorio.
2. **Root Directory**: `web` (si el repo es solo `automation`, la raíz del proyecto en Vercel apunta a `web`).
3. **Build**: `npm run build` (por defecto con Vite).
4. **Output**: `dist`.
5. **Variables de entorno** (Production **y** Preview; si no, el build de preview seguirá sin API):
   - `VITE_API_BASE_URL` = URL pública de tu API FastAPI, **sin barra final**, por ejemplo `https://tu-servicio.onrender.com`
6. Tras crear o cambiar variables, haz **Redeploy** (Vite inyecta las variables en el momento del build).

### Error `{"detail":"Not Found"}` en el navegador

Eso casi siempre significa que el front en Vercel está llamando a `/api/...` en el **mismo dominio de Vercel**, donde **no existe** la API (el backend va aparte). Solución: define `VITE_API_BASE_URL` apuntando solo al host de tu FastAPI y redeploy. No uses la URL del sitio de Vercel como base de la API.

En local, deja `VITE_API_BASE_URL` vacío: `vite` hace proxy de `/api` a tu uvicorn (ver `web/vite.config.js`).

## 2) API FastAPI (cualquier hosting con Python)

La API no va incluida en el build de Vercel. Opciones habituales: [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io), tu propio VPS.

- Comando de arranque (ejemplo): `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- Directorio de trabajo: raíz de `automation` (donde está `api/` e `informe_builder.py`).
- Dependencias: `pip install -r requirements.txt`
- CORS: por defecto se admiten orígenes locales y `https://*.vercel.app` (ver `api/main.py`). Variables útiles:
  - `CORS_ALLOW_ORIGINS` — lista separada por comas (orígenes exactos, ej. `https://tu-dominio.com`)
  - `CORS_ALLOW_VERCEL=0` — desactiva el patrón `*.vercel.app` si no lo usas
- Sube a Git la plantilla `FORMATO_LEC_…` si usas el informe por defecto, o el usuario debe subirla en la UI.

### 2.1) Railway (pasos concretos)

1. Sube el código a **GitHub** (la carpeta `automation` puede ser la raíz del repo o un subdirectorio; apunta a la raíz **donde** están `api/`, `informe_builder.py` y `requirements.txt`).
2. En [railway.app](https://railway.app): **New project** → **Deploy from GitHub** → elige el repo.
3. Si el repo contiene monorepo: en el servicio, **Settings → Root Directory** = la ruta a `automation` (por ejemplo `FORMATOS FORMULARIOS/automation` si aplica).
4. **Settings → Deploy → Custom Start Command** (o *Start Command*):
   ```bash
   uvicorn api.main:app --host 0.0.0.0 --port $PORT
   ```
5. **Variables** (la mayoría se generan solas; Railway inyecta `PORT`):
   - Si usas un dominio propio en el front, añade en la API: `CORS_ALLOW_ORIGINS=https://tu-proyecto.vercel.app,https://www.tu-dominio.com` (sin espacios extra).
6. Tras el deploy, anota la URL pública (p. ej. `https://informe-xxx.up.railway.app`). Prueba: `GET https://…/api/health`.
7. Esa URL **sin barra al final** es la que pones en Vercel como `VITE_API_BASE_URL` y haces **Redeploy** del front.

## 3) Comprobar

- API: `GET {VITE_API_BASE_URL}/api/health`
- En el sitio de Vercel: “Comprobar API” y probar “Construir panel” con el Excel.

## Archivos de referencia

- `web/.env.example` — plantilla de variables para el front
- `web/src/lib/apiBase.js` — lectura de `VITE_API_BASE_URL`
