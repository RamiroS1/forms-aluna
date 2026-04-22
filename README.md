# Automatización: informe de lecturas + panel ATILA

Repositorio: [https://github.com/RamiroS1/forms-aluna](https://github.com/RamiroS1/forms-aluna)

Aplicación **React (Vite) + Tailwind** en `web/`, y **API FastAPI** en `api/` (Python) para generar el Excel y resumir el progreso ATILA.

## Desarrollo local

**Frontend** (`web/`):

```bash
cd web
npm install
npm run dev
```

**API** (desde la raíz de este proyecto, carpeta `automation/`):

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python3 -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8001
```

En desarrollo, el proxy de Vite envía `/api` al puerto `8001` (ver `web/vite.config.js`).

## GitHub y Vercel

- Remoto configurado: `origin` → `https://github.com/RamiroS1/forms-aluna.git` · rama `main`
- El primer commit ya está hecho en esta copia. Para subir cambios (necesitas iniciar sesión en GitHub en tu máquina):
  - HTTPS: `git push -u origin main` (Git pedirá usuario y un **Personal Access Token** con permiso `repo`, no la contraseña de la cuenta)
  - O SSH: `git remote set-url origin git@github.com:RamiroS1/forms-aluna.git` y `git push -u origin main` (con clave SSH añadida en GitHub)
- Configura en Vercel el **root** del front en `web` y la variable `VITE_API_BASE_URL` apuntando a tu API pública.
- Instrucciones detalladas: [DEPLOY.md](./DEPLOY.md)

## Estructura principal

- `web/` — interfaz
- `api/main.py` — FastAPI
- `informe_builder.py` — generación del informe
- `progress_dashboard.py` — cálculo del panel de progreso
