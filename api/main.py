"""
API para generar el informe Excel (reutiliza informe_builder.py).
Ejecutar: uvicorn api.main:app --reload --host 127.0.0.1 --port 8001
(desde la carpeta automation/)
"""

from __future__ import annotations

import io
import json
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import sys

# automation/ está en sys.path cuando se corre desde automation/
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from informe_builder import (
    BuildConfig,
    build_workbook_bytes,
    build_workbook_zip_by_institution,
    default_template_path,
)
from progress_dashboard import build_progress_summary

app = FastAPI(title="Informe lecturas API", version="1.0.0")

_default_cors = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173"
_cors_list = [o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", _default_cors).split(",") if o.strip()]
# Despliegues en vercel.app (ajusta o desactiva con CORS_ALLOW_VERCEL=0)
_cors_rx = None
if os.environ.get("CORS_ALLOW_VERCEL", "1").lower() in ("1", "true", "yes", "on"):
    _cors_rx = r"^https://[a-z0-9-]+\.vercel\.app$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_list,
    allow_origin_regex=_cors_rx,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "default_template_exists": default_template_path().is_file(),
        # Si no ves 2, el servidor no tiene la última corrección de nombres de hoja (prefijo G_).
        "informe_sheet_tabs_build": 2,
    }


@app.post("/api/build-report")
async def build_report(
    admin: UploadFile = File(...),
    template: UploadFile | None = File(None),
    institution_contains: str = Form(""),
    reading_title: str = Form(""),
    report_date: str = Form(""),
    asignatura: str = Form(""),
    docente: str = Form(""),
    elaborado_por: str = Form(""),
    institution_label: str = Form(""),
    # single = un .xlsx; zip_by_institution = .zip con un .xlsx por colegio (columna Institución o colegio)
    export_mode: str = Form("single"),
    only_primary_institution: str = Form("true"),
    # JSON list of institution names; omit in ZIP mode = all schools. Empty list = error.
    zip_institutions_json: str | None = Form(None),
):
    admin_bytes = await admin.read()
    if not admin_bytes:
        raise HTTPException(400, "Archivo vacío o no recibido. Vuelve a elegir el archivo.")

    orig_name = (admin.filename or "").strip()
    if orig_name:
        suffix = Path(orig_name).suffix.lower()
        if suffix and suffix not in (".xlsx", ".xlsm", ".csv"):
            raise HTTPException(
                400,
                "Formato no admitido. Usa export del administrador: .xlsx, .xlsm o .csv.",
            )
    tpl_path: Path | None = None
    temp_tpl_created: Path | None = None

    try:
        if template and template.filename and template.filename.strip():
            suffix = ".xlsx"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(await template.read())
                temp_tpl_created = Path(tmp.name)
            tpl_path = temp_tpl_created
        else:
            tpl_path = default_template_path()
            if not tpl_path.is_file():
                raise HTTPException(
                    400,
                    "No hay plantilla por defecto en el servidor. Sube FORMATO_LEC…xlsx.",
                )

        mode = (export_mode or "single").strip().lower()
        cfg = BuildConfig(
            institution_contains=institution_contains.strip(),
            reading_title=reading_title.strip(),
            report_date=report_date.strip(),
            asignatura=asignatura.strip(),
            docente=docente.strip(),
            elaborado_por=elaborado_por.strip(),
            institution_label=institution_label.strip(),
            only_primary_institution=(only_primary_institution.lower() in ("true", "1", "yes", "on")),
        )

        zip_filter: list[str] | None = None
        if mode == "zip_by_institution" and zip_institutions_json is not None:
            t = (zip_institutions_json or "").strip()
            if t:
                try:
                    z = json.loads(t)
                except json.JSONDecodeError as exc:
                    raise HTTPException(400, "zip_institutions_json no es un JSON válido.") from exc
                if not isinstance(z, list):
                    raise HTTPException(400, "zip_institutions_json debe ser una lista de textos.")
                zip_filter = [str(x) for x in z]

        try:
            if mode == "zip_by_institution":
                buf = build_workbook_zip_by_institution(
                    io.BytesIO(admin_bytes),
                    tpl_path,
                    cfg,
                    source_filename=orig_name,
                    institution_filter=zip_filter,
                )
            else:
                buf = build_workbook_bytes(
                    io.BytesIO(admin_bytes),
                    tpl_path,
                    cfg,
                    source_filename=orig_name,
                )
        except (KeyError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from exc
        base = Path(orig_name if orig_name else "informe").stem[:50] or "informe"
        if mode == "zip_by_institution":
            return Response(
                content=buf,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename="informe_lecturas_por_colegio_{base}.zip"',
                },
            )
        return Response(
            content=buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="informe_lecturas_{base}.xlsx"'},
        )
    finally:
        if temp_tpl_created is not None:
            try:
                temp_tpl_created.unlink(missing_ok=True)
            except OSError:
                pass


@app.post("/api/progress-summary")
async def progress_summary(source: UploadFile = File(...)):
    if not source.filename or not source.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Sube un archivo Excel válido (.xlsx o .xlsm).")

    content = await source.read()
    if not content:
        raise HTTPException(400, "El archivo está vacío.")

    try:
        payload = build_progress_summary(io.BytesIO(content))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"No se pudo procesar el archivo: {exc}") from exc

    return payload
