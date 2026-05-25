import * as XLSX from 'xlsx'
import { normalizeSheetColumns } from './adminColumns.js'

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
 * Rango de columnas usado en el grid (0-based), sin depender de la primera fila.
 * Con encabezados fusionados o filas más cortas, `sheet_to_json` dejaba pocos
 * elementos y las respuestas a la derecha (p. ej. tras Grado/grupo) se desalineaban
 * o quedaban vacías en el objeto de la fila.
 */
function maxColIndexInSheet(ws) {
  let m = -1
  if (ws['!ref']) {
    const d = XLSX.utils.decode_range(ws['!ref'])
    m = Math.max(m, d.e.c)
  }
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue
    m = Math.max(m, XLSX.utils.decode_cell(k).c)
  }
  return m
}

function padRowToWidth(r, width) {
  const out = new Array(width)
  for (let i = 0; i < width; i += 1) {
    const v = r[i]
    out[i] = v === undefined || v === null ? '' : v
  }
  return out
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} [fileName] — si termina en .csv, se lee como texto (misma estructura que Excel de una hoja).
 * @returns {{ names: string[], sheets: Record<string, { columns: string[], rows: Record<string, unknown>[] }> }}
 */
export function parseDataFile(arrayBuffer, fileName = '') {
  const lower = (fileName || '').toLowerCase()
  let wb
  if (lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(arrayBuffer)
    wb = XLSX.read(text, { type: 'string', raw: false, cellDates: true })
  } else {
    wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  }
  return workbookToAppModel(wb)
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ names: string[], sheets: Record<string, { columns: string[], rows: Record<string, unknown>[] }> }}
 */
export function parseWorkbook(arrayBuffer) {
  return parseDataFile(arrayBuffer, '')
}

function workbookToAppModel(wb) {
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
    const fromSheet = maxColIndexInSheet(ws) + 1
    const fromRows = Math.max(1, ...matrix.map((r) => (Array.isArray(r) ? r.length : 0)))
    const width = Math.max(1, fromSheet, fromRows)
    const normalized = matrix.map((r) => {
      const arr = Array.isArray(r) ? r : []
      return padRowToWidth(arr, width)
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
    sheets[name] = normalizeSheetColumns({ columns, rows })
  }

  return { names, sheets }
}
