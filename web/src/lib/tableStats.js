import { parseCellToDayISO } from './dateColumns.js'
import { normalizeCellDisplay } from './cellDisplay.js'

export const COL_INST = 'Institución o colegio'
export const COL_GRADO = 'Grado'
export const COL_GRUPO = 'Indica el número o letra del grado'
export const COL_NOMBRE = 'Escribe tu nombre completo'
export const COL_CORREO = 'Correo electrónico'

function sortCountEntries(map, limit = 50) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    .slice(0, limit)
}

function columnLooksLikeDates(rows, col) {
  let ok = 0
  let n = 0
  for (const r of rows) {
    const v = r[col]
    if (v == null || v === '') continue
    n++
    if (parseCellToDayISO(v) != null) ok++
  }
  return n > 0 && ok / n >= 0.45
}

/** Primera columna tipo fecha o columna cuyo nombre sugiere fecha. */
export function resolveDateColumn(columns, rows) {
  if (!columns?.length) return null
  if (columnLooksLikeDates(rows, columns[0])) return columns[0]
  for (const c of columns) {
    if (/fecha|entrada|date|hora/i.test(String(c)) && columnLooksLikeDates(rows, c)) return c
  }
  for (const c of columns) {
    if (columnLooksLikeDates(rows, c)) return c
  }
  return null
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} columns
 */
export function computeTableStats(rows, columns) {
  const totalRows = rows.length

  const hasCol = (name) => columns.includes(name)

  /** @type {Map<string, number>} */
  const byInst = new Map()
  /** @type {Map<string, number>} */
  const byGrado = new Map()
  /** @type {Map<string, number>} */
  const byGrupo = new Map()
  /** @type {Map<string, number>} */
  const byGradoGrupo = new Map()
  /** @type {Set<string>} */
  const uniqueNames = new Set()
  /** @type {Set<string>} */
  const uniqueEmails = new Set()

  for (const r of rows) {
    if (hasCol(COL_INST)) {
      const label = normalizeCellDisplay(r[COL_INST])
      byInst.set(label, (byInst.get(label) ?? 0) + 1)
    }
    if (hasCol(COL_GRADO)) {
      const g = normalizeCellDisplay(r[COL_GRADO])
      byGrado.set(g, (byGrado.get(g) ?? 0) + 1)
    }
    if (hasCol(COL_GRUPO)) {
      const g = normalizeCellDisplay(r[COL_GRUPO])
      byGrupo.set(g, (byGrupo.get(g) ?? 0) + 1)
    }
    if (hasCol(COL_GRADO) && hasCol(COL_GRUPO)) {
      const gg = `${normalizeCellDisplay(r[COL_GRADO])} · ${normalizeCellDisplay(r[COL_GRUPO])}`
      byGradoGrupo.set(gg, (byGradoGrupo.get(gg) ?? 0) + 1)
    }
    if (hasCol(COL_NOMBRE)) {
      const n = String(r[COL_NOMBRE] ?? '').trim().toLowerCase()
      if (n) uniqueNames.add(n)
    }
    if (hasCol(COL_CORREO)) {
      const e = String(r[COL_CORREO] ?? '').trim().toLowerCase()
      if (e) uniqueEmails.add(e)
    }
  }

  const dateCol = resolveDateColumn(columns, rows)
  /** @type {Map<string, number>} */
  const byDay = new Map()
  const rawDays = []

  if (dateCol) {
    for (const r of rows) {
      const day = parseCellToDayISO(r[dateCol])
      if (day) {
        byDay.set(day, (byDay.get(day) ?? 0) + 1)
        rawDays.push(day)
      }
    }
  }

  const dayEntries = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  let minDay = null
  let maxDay = null
  let daySpanDays = null
  if (dayEntries.length) {
    minDay = dayEntries[0][0]
    maxDay = dayEntries[dayEntries.length - 1][0]
    const t0 = new Date(minDay + 'T12:00:00')
    const t1 = new Date(maxDay + 'T12:00:00')
    daySpanDays = Math.round((t1 - t0) / 86400000)
  }

  let peakDay = null
  let quietestDay = null
  if (dayEntries.length) {
    let maxC = -1
    let minC = Infinity
    for (const [day, c] of dayEntries) {
      if (c > maxC) {
        maxC = c
        peakDay = { day, count: c }
      }
      if (c < minC) {
        minC = c
        quietestDay = { day, count: c }
      }
    }
  }

  const institutionsDistinct = hasCol(COL_INST) ? byInst.size : 0
  const gradosDistinct = hasCol(COL_GRADO) ? byGrado.size : 0

  return {
    totalRows,
    columnsPresent: {
      institution: hasCol(COL_INST),
      grado: hasCol(COL_GRADO),
      grupo: hasCol(COL_GRUPO),
      dateCol,
    },
    dateColumnName: dateCol,
    byInstitution: hasCol(COL_INST) ? sortCountEntries(byInst, 80) : [],
    byGrado: hasCol(COL_GRADO) ? sortCountEntries(byGrado, 40) : [],
    byGrupo: hasCol(COL_GRUPO) ? sortCountEntries(byGrupo, 40) : [],
    byGradoGrupo: hasCol(COL_GRADO) && hasCol(COL_GRUPO) ? sortCountEntries(byGradoGrupo, 60) : [],
    uniqueRespondents: hasCol(COL_NOMBRE) ? uniqueNames.size : null,
    uniqueEmails: hasCol(COL_CORREO) ? uniqueEmails.size : null,
    institutionsDistinct,
    gradosDistinct,
    dateSummary: {
      hasDates: dayEntries.length > 0,
      minDay,
      maxDay,
      daySpanDays,
      totalWithValidDate: rawDays.length,
      daysWithActivity: dayEntries.length,
      byDay: dayEntries.map(([day, count]) => ({ day, count })),
      peakDay,
      quietestDay,
    },
  }
}
