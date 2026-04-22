/**
 * Solo la primera columna del Excel (p. ej. «Fecha entrada») usa filtro con calendario.
 */
export function detectDateColumns(columns, _rows) {
  if (!columns.length) return new Set()
  return new Set([columns[0]])
}

/** @param {unknown} cell */
export function parseCellToDayISO(cell) {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number' && cell > 20000 && cell < 100000) {
    const u = (cell - 25569) * 86400 * 1000
    const d = new Date(u)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  if (typeof cell === 'number') {
    const d = new Date(cell)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const s = String(cell).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}

/** @param {unknown} cell @param {{ op: string, value?: string }|undefined} filter */
export function matchesDateColumnFilter(cell, filter) {
  if (!filter) return true
  const { op, value } = filter
  const day = parseCellToDayISO(cell)
  const fv = String(value ?? '').trim().slice(0, 10)
  switch (op) {
    case 'empty':
      return cell == null || String(cell).trim() === ''
    case 'notEmpty':
      return !(cell == null || String(cell).trim() === '')
    case 'dateEquals':
      if (!fv) return true
      return day !== null && day === fv
    case 'dateOnOrBefore':
      if (!fv) return true
      return day !== null && day <= fv
    case 'dateOnOrAfter':
      if (!fv) return true
      return day !== null && day >= fv
    default:
      return true
  }
}
