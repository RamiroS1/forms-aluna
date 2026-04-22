from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO

import pandas as pd


def _is_filled(value) -> bool:
    if value is None:
        return False
    if isinstance(value, float) and pd.isna(value):
        return False
    return str(value).strip() != ""


@dataclass
class _ActivityRow:
    component: str
    no_act: str
    activity: str
    planned_date: str
    school_values: dict[str, bool]


def _normalize_header(name) -> str:
    return str(name or "").strip().upper()


def _collect_activities(source: str | BinaryIO) -> tuple[list[_ActivityRow], list[str]]:
    df = pd.read_excel(source, header=None, engine="openpyxl")
    if df.empty or len(df.columns) < 6:
        raise ValueError("El archivo no contiene suficientes columnas para construir el panel.")

    header = [_normalize_header(v) for v in df.iloc[0].tolist()]
    try:
        component_idx = header.index("COMPONENTE")
        no_act_idx = header.index("NO ACT")
        activity_idx = header.index("ACTIVIDAD")
        planned_idx = header.index("FECHA PROGRAMADA")
        college_start_idx = header.index("COLEGIO")
        status_idx = header.index("ESTADO")
    except ValueError as exc:
        raise ValueError(
            "No se encontraron encabezados esperados (COMPONENTE, No Act, ACTIVIDAD, FECHA PROGRAMADA, COLEGIO, ESTADO)."
        ) from exc

    school_indices = list(range(college_start_idx, status_idx))
    school_names_row = df.iloc[1].tolist() if len(df.index) > 1 else []
    schools = []
    for idx in school_indices:
        school_name = str(school_names_row[idx]).strip() if idx < len(school_names_row) else ""
        schools.append(school_name if school_name else f"Colegio {idx - college_start_idx + 1}")

    activities: list[_ActivityRow] = []
    current_component = ""

    for row_idx in range(1, len(df.index)):
        row = df.iloc[row_idx].tolist()

        component_val = str(row[component_idx]).strip() if component_idx < len(row) and _is_filled(row[component_idx]) else ""
        if component_val:
            current_component = component_val

        activity_val = row[activity_idx] if activity_idx < len(row) else None
        if not _is_filled(activity_val):
            continue

        no_act_val = row[no_act_idx] if no_act_idx < len(row) else None
        planned_val = row[planned_idx] if planned_idx < len(row) else None

        school_values: dict[str, bool] = {}
        for school_idx, school_name in zip(school_indices, schools):
            school_cell = row[school_idx] if school_idx < len(row) else None
            school_values[school_name] = _is_filled(school_cell)

        activities.append(
            _ActivityRow(
                component=current_component or "SIN COMPONENTE",
                no_act=str(no_act_val).strip() if _is_filled(no_act_val) else "",
                activity=str(activity_val).strip(),
                planned_date=str(planned_val).strip() if _is_filled(planned_val) else "",
                school_values=school_values,
            )
        )

    if not activities:
        raise ValueError("No se encontraron actividades con datos en la columna ACTIVIDAD.")

    return activities, schools


def build_progress_summary(source: str | BinaryIO) -> dict:
    activities, schools = _collect_activities(source)
    total_schools = len(schools)
    total_activities = len(activities)
    total_slots = total_activities * total_schools

    component_stats: dict[str, dict] = {}
    school_stats: dict[str, dict] = {
        school: {"school": school, "completed_slots": 0, "total_slots": 0} for school in schools
    }

    activity_rows = []
    for item in activities:
        completed = sum(1 for v in item.school_values.values() if v)
        pct = round((completed / total_schools) * 100, 1) if total_schools else 0.0
        completed_school_names = [school for school, done in item.school_values.items() if done]
        pending_school_names = [school for school, done in item.school_values.items() if not done]

        activity_rows.append(
            {
                "component": item.component,
                "no_act": item.no_act,
                "activity": item.activity,
                "planned_date": item.planned_date,
                "completed_schools": completed,
                "total_schools": total_schools,
                "progress_pct": pct,
                "completed_school_names": completed_school_names,
                "pending_school_names": pending_school_names,
            }
        )

        cs = component_stats.setdefault(
            item.component,
            {
                "component": item.component,
                "completed_slots": 0,
                "total_slots": 0,
                "activities_count": 0,
                "_school": {school: {"done": 0, "total": 0} for school in schools},
            },
        )
        cs["completed_slots"] += completed
        cs["total_slots"] += total_schools
        cs["activities_count"] += 1

        for school, is_done in item.school_values.items():
            cs["_school"][school]["total"] += 1
            school_stats[school]["total_slots"] += 1
            if is_done:
                cs["_school"][school]["done"] += 1
                school_stats[school]["completed_slots"] += 1

    component_summary = []
    matrix_components = []
    matrix_values = []
    for component in sorted(component_stats.keys()):
        cs = component_stats[component]
        pct = round((cs["completed_slots"] / cs["total_slots"]) * 100, 1) if cs["total_slots"] else 0.0
        school_breakdown = []
        for school in schools:
            school_done = cs["_school"][school]["done"]
            school_total = cs["_school"][school]["total"]
            school_pct = round((school_done / school_total) * 100, 1) if school_total else 0.0
            school_breakdown.append(
                {
                    "school": school,
                    "completed_slots": school_done,
                    "total_slots": school_total,
                    "progress_pct": school_pct,
                }
            )
        school_breakdown.sort(key=lambda row: row["progress_pct"], reverse=True)

        component_summary.append(
            {
                "component": component,
                "activities_count": cs["activities_count"],
                "completed_slots": cs["completed_slots"],
                "total_slots": cs["total_slots"],
                "progress_pct": pct,
                "school_breakdown": school_breakdown,
            }
        )

        matrix_components.append(component)
        matrix_values.append(
            [
                round((cs["_school"][school]["done"] / cs["_school"][school]["total"]) * 100, 1)
                if cs["_school"][school]["total"]
                else 0.0
                for school in schools
            ]
        )

    school_summary = []
    for school in schools:
        ss = school_stats[school]
        pct = round((ss["completed_slots"] / ss["total_slots"]) * 100, 1) if ss["total_slots"] else 0.0
        component_breakdown = []
        for component in sorted(component_stats.keys()):
            done = component_stats[component]["_school"][school]["done"]
            total = component_stats[component]["_school"][school]["total"]
            component_pct = round((done / total) * 100, 1) if total else 0.0
            component_breakdown.append(
                {
                    "component": component,
                    "completed_slots": done,
                    "total_slots": total,
                    "progress_pct": component_pct,
                }
            )
        component_breakdown.sort(key=lambda row: row["progress_pct"], reverse=True)

        school_summary.append(
            {
                "school": school,
                "completed_slots": ss["completed_slots"],
                "total_slots": ss["total_slots"],
                "progress_pct": pct,
                "component_breakdown": component_breakdown,
            }
        )
    school_summary.sort(key=lambda item: item["progress_pct"], reverse=True)

    activity_rows.sort(key=lambda item: item["progress_pct"])
    overall_pct = round((sum(i["completed_schools"] for i in activity_rows) / total_slots) * 100, 1) if total_slots else 0.0

    return {
        "summary": {
            "components_count": len(component_summary),
            "schools_count": total_schools,
            "activities_count": total_activities,
            "total_slots": total_slots,
            "completed_slots": sum(i["completed_schools"] for i in activity_rows),
            "overall_progress_pct": overall_pct,
        },
        "component_progress": component_summary,
        "school_progress": school_summary,
        "activity_progress": activity_rows,
        "heatmap": {
            "components": matrix_components,
            "schools": schools,
            "values": matrix_values,
        },
    }
