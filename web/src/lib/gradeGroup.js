import { COL_GRADO as GRADO, COL_GRUPO as GRUPO, COL_INST as INST } from './adminColumns.js'

/** Coincide con informe_builder.py (filtro de institución). */
export function institutionMatch(cellValue, needle) {
  if (needle == null || !String(needle).trim()) return true
  if (cellValue == null || cellValue === '') return false
  return String(cellValue).toLowerCase().includes(String(needle).toLowerCase())
}

const INVALID = /[\[\]:*?/\\]/g

export function normalizeGrade(grade) {
  if (grade == null || grade === '') return null
  let s = String(grade).trim().replace(/º/g, '').replace(/°/g, '').trim()
  const digits = [...s].filter((c) => /\d/.test(c)).join('')
  if (digits) return digits
  const m = s.match(/(\d+)/)
  return m ? m[1] : null
}

export function normalizeSubgroup(sub) {
  if (sub == null || sub === '') return null
  const s = String(sub).trim()
  if (/^-\d+$/.test(s)) return null
  if (!s) return null
  if (/^\d+$/.test(s)) return String(parseInt(s, 10))
  return s
}

export function sheetKeyFromRow(grade, subgroup) {
  const g = normalizeGrade(grade)
  const sub = normalizeSubgroup(subgroup)
  if (!g || !sub) return null
  return `${g}-${sub}`
}

export function safeSheetTitle(name) {
  let n = String(name).trim().replace(INVALID, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!n) n = 'HOJA'
  return n.slice(0, 31)
}

export function sheetSortKeyCompare(a, b) {
  const parse = (s) => {
    const m = /^(\d+)-(.+)$/.exec(s)
    return m ? [parseInt(m[1], 10), m[2]] : [999, s]
  }
  const [ga, sa] = parse(a)
  const [gb, sb] = parse(b)
  if (ga !== gb) return ga - gb
  return String(sa).localeCompare(String(sb), 'es', { numeric: true })
}

export function canGroupByGrade(columns) {
  return columns.includes(INST) && columns.includes(GRADO) && columns.includes(GRUPO)
}

/**
 * @param {Record<string, unknown>[]} allRows
 * @param {string} institutionContains
 * @param {boolean} onlyPrimaryInstitution - true = misma lógica que API sin «Incluir otras instituciones»
 */
export function splitRowsByGradeGroup(allRows, institutionContains, onlyPrimaryInstitution) {
  const buckets = Object.create(null)
  const otros = []
  const otrosTitle = 'OTROS'

  const isPrimary = (r) => institutionMatch(r[INST], institutionContains)

  if (onlyPrimaryInstitution) {
    for (const row of allRows) {
      if (!isPrimary(row)) continue
      const key = sheetKeyFromRow(row[GRADO], row[GRUPO])
      if (key == null) {
        otros.push(row)
      } else {
        const t = safeSheetTitle(key)
        if (!buckets[t]) buckets[t] = []
        buckets[t].push(row)
      }
    }
  } else {
    for (const row of allRows) {
      if (!isPrimary(row)) {
        otros.push(row)
        continue
      }
      const key = sheetKeyFromRow(row[GRADO], row[GRUPO])
      if (key == null) {
        otros.push(row)
      } else {
        const t = safeSheetTitle(key)
        if (!buckets[t]) buckets[t] = []
        buckets[t].push(row)
      }
    }
  }

  const sortedKeys = Object.keys(buckets).sort(sheetSortKeyCompare)
  return { buckets, sortedKeys, otros, otrosTitle }
}
