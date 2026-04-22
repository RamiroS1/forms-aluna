/** Clave estable para comparar / agrupar celdas en filtros de valores únicos. */
export function normalizeCellDisplay(cell) {
  if (cell == null || cell === '') return '(Vacío)'
  const s = String(cell).trim()
  return s || '(Vacío)'
}
