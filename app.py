"""
Informe de lecturas — generador automático (Streamlit).

Ejecutar desde esta carpeta:
  streamlit run app.py
"""

from __future__ import annotations

import io
from pathlib import Path

import streamlit as st

from informe_builder import (
    BuildConfig,
    build_workbook_bytes,
    build_workbook_zip_by_institution,
    default_template_path,
    load_admin_dataframe,
    unique_institution_values,
)

st.set_page_config(page_title="Informe de lecturas", layout="wide")
st.title("Informe de lecturas — Excel administrador → plantilla")
st.caption(
    "Sube el archivo exportado del administrador (tabla plana). "
    "Se generará un libro con hojas por grado-grupo y OTROS, como el ejemplo enviado.",
)

with st.sidebar:
    st.header("Parámetros")
    institution = st.text_input(
        "Filtrar institución (contiene)",
        value="",
        help="Solo las filas cuya columna «Institución o colegio» contenga este texto "
        "se reparten en hojas por grado-grupo. El resto va a OTROS.",
    )
    reading_title = st.text_input(
        "Título de la lectura (celda B7)",
        value="No es madera, pero parece: así es la ‘revolución plástica’ que llegó al campo",
    )
    report_date = st.text_input(
        "Fecha del informe (celda L7)",
        value="02 de marzo",
    )
    asignatura = st.text_input(
        "Asignatura (celda I2)",
        value="LENGUA CASTELLANA",
        help="Aparece junto a «ASIGNATURA» en la plantilla (no confundir con elaborado por).",
    )
    docente = st.text_input(
        "Docente (celda I3)",
        value="",
        help="Aparece junto a «DOCENTE» en la plantilla.",
    )
    elaborado_por = st.text_input(
        "Elaborado por (celda I4)",
        value="",
        help="Aparece junto a «ELABORADO POR» (quien firma o elabora el informe; no es la asignatura).",
    )
    institution_label = st.text_input(
        "Institución en portada (celda D2) — solo modo un solo Excel",
        value="",
        help="Si vacío, no se cambia D2. En export ZIP, D2 se rellena por colegio automáticamente.",
    )
    export_mode = st.radio(
        "Exportación",
        options=("single", "zip_by_institution"),
        format_func=lambda v: "Un solo Excel"
        if v == "single"
        else "Un Excel por colegio (archivo .zip)",
        index=0,
    )
    incluir_otras = st.checkbox(
        "Incluir otras instituciones en la hoja OTROS",
        value=False,
        help="Si está desmarcado, solo se usan filas de la institución indicada; OTROS queda solo con "
        "filas de esa institución sin grado/grupo claro.",
    )
    template_default = default_template_path()
    template_upload = st.file_uploader(
        "Plantilla FORMATO_LEC (.xlsx) — opcional",
        type=["xlsx"],
        help=f"Si no subes nada, se usa: {template_default}",
    )

admin_file = st.file_uploader(
    "Archivo del administrador (.xlsx, .xlsm o .csv)",
    type=["xlsx", "xlsm", "csv"],
)

if not admin_file:
    st.info("Sube el Excel descargado del administrador para continuar.")
    st.stop()

template_path = template_default
if template_upload:
    tpl_bytes = template_upload.read()
    custom_tpl = Path(__file__).resolve().parent / "_uploaded_template.xlsx"
    custom_tpl.write_bytes(tpl_bytes)
    template_path = custom_tpl

if not template_path.is_file():
    st.error(f"No se encontró la plantilla en: {template_path}")
    st.stop()

source_name = getattr(admin_file, "name", "") or ""

zip_filter: list | None = None
if export_mode == "zip_by_institution":
    try:
        df_zip, _ = load_admin_dataframe(io.BytesIO(admin_file.getvalue()), source_filename=source_name)
        all_schools = unique_institution_values(df_zip)
    except (KeyError, ValueError) as e:
        st.error(f"No se pudo leer el archivo para el ZIP por colegio: {e}")
        st.stop()
    if not all_schools:
        st.warning("No hay valores en «Institución o colegio» en la primera hoja; no se puede generar un ZIP por colegio.")
        st.stop()
    pick = st.multiselect(
        "Colegios a incluir en el ZIP (primera hoja del administrador)",
        options=all_schools,
        default=all_schools,
    )
    if not pick:
        st.error("Elige al menos un colegio o cambia a un solo informe.")
        st.stop()
    zip_filter = pick

config = BuildConfig(
    institution_contains=institution.strip(),
    reading_title=reading_title.strip(),
    report_date=report_date.strip(),
    asignatura=asignatura.strip(),
    docente=docente.strip(),
    elaborado_por=elaborado_por.strip(),
    institution_label=institution_label.strip(),
    only_primary_institution=not incluir_otras,
)

try:
    if export_mode == "zip_by_institution":
        out_bytes = build_workbook_zip_by_institution(
            admin_file,
            template_path,
            config,
            source_filename=source_name,
            institution_filter=zip_filter,
        )
    else:
        out_bytes = build_workbook_bytes(
            admin_file,
            template_path,
            config,
            source_filename=source_name,
        )
except Exception as e:
    st.error(f"Error al generar el archivo: {e}")
    st.exception(e)
    st.stop()

safe_name = Path(admin_file.name).stem[:40] or "informe"
st.success("Listo. Descarga el archivo generado.")
if export_mode == "zip_by_institution":
    st.download_button(
        label="Descargar ZIP (un informe por colegio)",
        data=out_bytes,
        file_name=f"informe_lecturas_por_colegio_{safe_name}.zip",
        mime="application/zip",
    )
else:
    st.download_button(
        label="Descargar informe (.xlsx)",
        data=out_bytes,
        file_name=f"informe_lecturas_{safe_name}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
