"""Nombres canónicos de columnas del export Gravity / administrador y alias habituales."""

from __future__ import annotations

import unicodedata

import pandas as pd

INST_COL = "Institución o colegio"
GRADO_COL = "Grado"
GRUPO_COL = "Indica el número o letra del grado"

REQUIRED_ADMIN_COLS = (INST_COL, GRADO_COL, GRUPO_COL)


def _norm_key(name: str) -> str:
    s = unicodedata.normalize("NFC", str(name).strip().lower())
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return s


_ALIASES: dict[str, str] = {
    _norm_key(INST_COL): INST_COL,
    _norm_key("Institución o Colegio"): INST_COL,
    _norm_key(GRADO_COL): GRADO_COL,
    _norm_key(GRUPO_COL): GRUPO_COL,
}


def canonical_column_name(name: str) -> str:
    key = _norm_key(name)
    return _ALIASES.get(key, str(name).strip())


def normalize_admin_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename = {c: canonical_column_name(c) for c in df.columns}
    return df.rename(columns=rename)
