"""
Genera libros Excel en el formato del informe de lecturas (plantilla + ejemplo enviado)
a partir del archivo plano exportado por el administrador.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

import pandas as pd
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

INVALID_SHEET_CHARS = re.compile(r'[\[\]:*?/\\]')


@dataclass
class BuildConfig:
    """Parámetros del informe generado."""

    institution_contains: str = "Aurelio Martínez Mutis"
    reading_title: str = ""
    report_date: str = ""
    otros_sheet_name: str = "OTROS"
    # Si True: solo filas de la institución indicada; OTROS = solo grado/grupo no clasificable.
    # Si False: el resto de instituciones va a OTROS (útil para un solo archivo maestro).
    only_primary_institution: bool = True


def _normalize_grade(grade) -> str | None:
    if grade is None or (isinstance(grade, float) and pd.isna(grade)):
        return None
    s = str(grade).strip()
    s = s.replace("º", "").replace("°", "").strip()
    # quitar texto tipo "Estudiantes PFC (ENSAS)"
    digits = "".join(ch for ch in s if ch.isdigit())
    if digits:
        return digits
    # fallback: primera secuencia alfanumérica útil
    m = re.search(r"(\d+)", s)
    return m.group(1) if m else None


def _normalize_subgroup(sub) -> str | None:
    if sub is None or (isinstance(sub, float) and pd.isna(sub)):
        return None
    s = str(sub).strip()
    # Valores tipo "-5" en el Excel suelen ser error de captura; no fusionar con el grupo "5".
    if re.match(r"^-\d+$", s):
        return None
    if not s:
        return None
    # "04" -> "4", pero mantener "A", "B"
    if re.fullmatch(r"\d+", s):
        return str(int(s))
    return s


def sheet_key_from_row(grade, subgroup) -> str | None:
    g = _normalize_grade(grade)
    sub = _normalize_subgroup(subgroup)
    if not g or not sub:
        return None
    return f"{g}-{sub}"


def safe_sheet_title(name: str, max_len: int = 31) -> str:
    name = INVALID_SHEET_CHARS.sub("-", name.strip())
    name = re.sub(r"-{2,}", "-", name).strip("-")
    if not name:
        name = "HOJA"
    return name[:max_len]


def _institution_match(cell_value, needle: str) -> bool:
    if needle is None or str(needle).strip() == "":
        return True
    if cell_value is None or (isinstance(cell_value, float) and pd.isna(cell_value)):
        return False
    return str(needle).lower() in str(cell_value).lower()


def load_admin_dataframe(source: str | Path | BinaryIO) -> tuple[pd.DataFrame, list[str]]:
    """Lee el Excel del admin; devuelve DataFrame y lista de nombres de columnas (encabezados)."""
    df = pd.read_excel(source, header=0, engine="openpyxl")
    cols = [str(c).strip() for c in df.columns.tolist()]
    df.columns = cols
    return df, cols


def split_rows_by_sheet(
    df: pd.DataFrame,
    config: BuildConfig,
) -> tuple[dict[str, pd.DataFrame], pd.DataFrame]:
    """
    Separa filas en:
    - buckets por grado-grupo (ej. '7-2') para institución principal
    - DataFrame OTROS: según configuración, filas no clasificables y/o otras instituciones
    """
    inst_col = "Institución o colegio"
    grado_col = "Grado"
    grupo_col = "Indica el número o letra del grado"

    for c in (inst_col, grado_col, grupo_col):
        if c not in df.columns:
            raise KeyError(f"Falta la columna obligatoria «{c}». Columnas: {list(df.columns)}")

    work = df
    if config.only_primary_institution:
        mask = df[inst_col].apply(lambda v: _institution_match(v, config.institution_contains))
        work = df[mask].copy()
        otros_mask = pd.Series(False, index=work.index)
        # Si el texto de institución no coincide con ninguna fila, el informe quedaba vacío
        # mientras la vista previa en el front muestra todo. Usar todas las filas como respaldo.
        if work.empty and not df.empty:
            work = df.copy()
            otros_mask = pd.Series(False, index=work.index)
    else:
        otros_mask = ~work[inst_col].apply(lambda v: _institution_match(v, config.institution_contains))

    buckets: dict[str, list] = {}
    otros_extra: list = []

    for idx in work.index:
        if otros_mask.loc[idx] if idx in otros_mask.index else False:
            continue
        row = work.loc[idx]
        key = sheet_key_from_row(row[grado_col], row[grupo_col])
        if key is None:
            otros_extra.append(idx)
            continue
        buckets.setdefault(key, []).append(idx)

    sheet_frames: dict[str, pd.DataFrame] = {}
    for key, idx_list in sorted(buckets.items()):
        sheet_frames[safe_sheet_title(key)] = work.loc[idx_list].copy()

    otros_parts: list[pd.DataFrame] = []
    if not config.only_primary_institution:
        otros_parts.append(work.loc[otros_mask])
    if otros_extra:
        otros_parts.append(work.loc[otros_extra])
    otros_df = (
        pd.concat(otros_parts, axis=0).drop_duplicates()
        if otros_parts
        else pd.DataFrame(columns=work.columns)
    )

    return sheet_frames, otros_df


def build_workbook_bytes(
    admin_source: str | Path | BinaryIO,
    template_path: str | Path,
    config: BuildConfig,
) -> bytes:
    """
    Carga plantilla + admin y devuelve el .xlsx en memoria (bytes).
    """
    df, header_row = load_admin_dataframe(admin_source)
    sheet_frames, otros_df = split_rows_by_sheet(df, config)

    template_path = Path(template_path)
    if not template_path.is_file():
        raise FileNotFoundError(f"No existe la plantilla: {template_path}")

    wb = load_workbook(template_path)
    if "10-1" not in wb.sheetnames:
        raise ValueError(
            "La plantilla debe contener la hoja «10-1» como base de encabezados/estilos.",
        )

    master_name = "10-1"
    for sn in list(wb.sheetnames):
        if sn != master_name:
            wb.remove(wb[sn])

    ordered_sheets: list[str] = []
    for k in sorted(sheet_frames.keys(), key=lambda x: _sheet_sort_key(x)):
        ordered_sheets.append(k)
    otros_title = safe_sheet_title(config.otros_sheet_name)
    if not otros_df.empty:
        ordered_sheets.append(otros_title)

    if not ordered_sheets:
        ordered_sheets = [otros_title]
        sheet_frames = {}
        if otros_df.empty:
            otros_df = df.iloc[0:0].copy()

    ws_master = wb[master_name]
    ws_master.title = ordered_sheets[0]

    for title in ordered_sheets[1:]:
        duplicated = wb.copy_worksheet(ws_master)
        duplicated.title = title

    def fill_sheet(title: str, part: pd.DataFrame) -> None:
        ws = wb[title]
        ws["B7"] = config.reading_title or ""
        ws["L7"] = config.report_date or ""
        for c_idx, name in enumerate(header_row, start=1):
            ws.cell(row=8, column=c_idx, value=name)
        for r_off, (_, row) in enumerate(part.iterrows(), start=9):
            for c_idx, col_name in enumerate(header_row, start=1):
                val = row[col_name]
                if pd.isna(val):
                    val = None
                elif isinstance(val, pd.Timestamp):
                    val = val.to_pydatetime()
                ws.cell(row=r_off, column=c_idx, value=val)

    for title in sheet_frames:
        fill_sheet(title, sheet_frames[title])
    if not otros_df.empty:
        fill_sheet(otros_title, otros_df)

    bio = io.BytesIO()
    wb.save(bio)
    wb.close()
    bio.seek(0)
    return bio.read()


def _sheet_sort_key(name: str) -> tuple:
    m = re.match(r"^(\d+)-(.+)$", name)
    if m:
        return (int(m.group(1)), m.group(2))
    return (999, name)


def default_template_path() -> Path:
    base = Path(__file__).resolve().parent.parent
    cand = base / "FORMATO_LEC_AURELIO MARTÍNEZ MUTIS.xlsx"
    return cand
