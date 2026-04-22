import * as XLSX from 'xlsx'

function uniqueHeaders(headers) {
  const seen = {}
  return headers.map((h, idx) => {
    const base = String(h ?? '').trim() || `Columna ${idx + 1}`
    seen[base] = (seen[base] ?? 0) + 1
    const n = seen[base]
    return n === 1 ? base : `${base} (${n})`
  })
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ names: string[], sheets: Record<string, { columns: string[], rows: Record<string, unknown>[] }> }}
 */
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const names = wb.SheetNames
  const sheets = {}

  for (const name of names) {
    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) {
      sheets[name] = { columns: [], rows: [] }
      continue
    }
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
    if (!matrix.length) {
      sheets[name] = { columns: [], rows: [] }
      continue
    }
    const width = Math.max(...matrix.map((r) => r.length))
    const normalized = matrix.map((r) => {
      const copy = [...r]
      while (copy.length < width) copy.push('')
      return copy
    })
    const headerCells = normalized[0].map((c) => (c == null ? '' : String(c)))
    const columns = uniqueHeaders(headerCells)
    const rows = normalized.slice(1).map((cells) => {
      const row = {}
      columns.forEach((col, i) => {
        row[col] = cells[i]
      })
      return row
    })
    sheets[name] = { columns, rows }
  }

  return { names, sheets }
}
