/** Nombres canónicos del export Gravity y alias (p. ej. «Institución o Colegio»). */

export const COL_INST = 'Institución o colegio'
export const COL_GRADO = 'Grado'
export const COL_GRUPO = 'Indica el número o letra del grado'

function normKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

const ALIASES = new Map([
  [normKey(COL_INST), COL_INST],
  [normKey('Institución o Colegio'), COL_INST],
  [normKey(COL_GRADO), COL_GRADO],
  [normKey(COL_GRUPO), COL_GRUPO],
])

export function canonicalColumnName(name) {
  const key = normKey(name)
  return ALIASES.get(key) ?? String(name ?? '').trim()
}

/**
 * @param {{ columns: string[], rows: Record<string, unknown>[] }} sheet
 */
export function normalizeSheetColumns(sheet) {
  const columns = sheet.columns.map((c) => canonicalColumnName(c))
  const rows = sheet.rows.map((row) => {
    const out = {}
    for (const col of sheet.columns) {
      const canon = canonicalColumnName(col)
      out[canon] = row[col]
    }
    return out
  })
  return { columns, rows }
}
