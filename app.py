"""
Informe de lecturas — generador automático (Streamlit).

Ejecutar desde esta carpeta:
  streamlit run app.py
"""

from __future__ import annotations

from pathlib import Path

import streamlit as st

from informe_builder import BuildConfig, build_workbook_bytes, default_template_path

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
        value="Aurelio Martínez Mutis",
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
    "Archivo del administrador (.xlsx)",
    type=["xlsx"],
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

config = BuildConfig(
    institution_contains=institution.strip(),
    reading_title=reading_title.strip(),
    report_date=report_date.strip(),
    only_primary_institution=not incluir_otras,
)

try:
    out_bytes = build_workbook_bytes(admin_file, template_path, config)
except Exception as e:
    st.error(f"Error al generar el archivo: {e}")
    st.exception(e)
    st.stop()

safe_name = Path(admin_file.name).stem[:40] or "informe"
st.success("Listo. Descarga el informe generado.")
st.download_button(
    label="Descargar informe (.xlsx)",
    data=out_bytes,
    file_name=f"informe_lecturas_{safe_name}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)
