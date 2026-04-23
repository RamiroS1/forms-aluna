import { useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { normalizeCellDisplay } from '../lib/cellDisplay.js'
import { detectDateColumns, matchesDateColumnFilter } from '../lib/dateColumns.js'

const FILTER_OPS_DATE = [
  { value: 'dateEquals', label: 'Día igual' },
  { value: 'dateOnOrBefore', label: 'Hasta el día (incl.)' },
  { value: 'dateOnOrAfter', label: 'Desde el día (incl.)' },
  { value: 'empty', label: 'Vacío' },
  { value: 'notEmpty', label: 'No vacío' },
]

const DATE_OP_SET = new Set(FILTER_OPS_DATE.map((o) => o.value))

function matchesTextContains(cell, filter) {
  if (!filter) return true
  const value = typeof filter === 'string' ? filter : filter.value
  const raw = cell == null ? '' : String(cell)
  const lower = raw.toLowerCase()
  const q = String(value ?? '').trim().toLowerCase()
  if (!q) return true
  return lower.includes(q)
}

/**
 * @param {Record<string, Set<string> | undefined>} allowedMap undefined = sin restricción de valores
 */
function rowPassesValuePickers(row, columnIds, allowedMap) {
  for (const columnId of columnIds) {
    const allowed = allowedMap[columnId]
    if (allowed === undefined) continue
    const disp = normalizeCellDisplay(row[columnId])
    if (!allowed.has(disp)) return false
  }
  return true
}

export default function SheetTable({
  columns,
  rows,
  globalFilter,
  onGlobalFilterChange,
  onFilteredRowsChange,
}) {
  const [columnFilters, setColumnFilters] = useState([])
  /** @type {Record<string, Set<string> | undefined>} */
  const [valueAllowedByColumn, setValueAllowedByColumn] = useState({})
  const [openValuePicker, setOpenValuePicker] = useState(null)
  const [pickerSearch, setPickerSearch] = useState('')

  /** Filas con todas las claves de columnas (evita celdas vacías por claves faltantes). */
  const rowsFilled = useMemo(() => {
    if (!columns?.length) return rows
    return rows.map((r) => {
      const o = { ...r }
      for (const c of columns) {
        if (!(c in o)) o[c] = ''
      }
      return o
    })
  }, [rows, columns])

  const dateColumnKeys = useMemo(() => detectDateColumns(columns, rowsFilled), [columns, rowsFilled])

  const uniqueByColumn = useMemo(() => {
    const m = {}
    for (const col of columns) {
      const s = new Set()
      for (const r of rowsFilled) {
        s.add(normalizeCellDisplay(r[col]))
      }
      m[col] = [...s].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
    }
    return m
  }, [columns, rowsFilled])

  const setFilter = (updater) => {
    const next = typeof updater === 'function' ? updater(globalFilter ?? '') : updater
    onGlobalFilterChange(next)
  }

  const hasValueFilters = Object.keys(valueAllowedByColumn).length > 0

  const toggleValueAllowed = (colId, value, allUniques) => {
    const all = new Set(allUniques)
    let cur = valueAllowedByColumn[colId]
    if (cur === undefined) cur = new Set(all)
    const next = new Set(cur)
    if (next.has(value)) next.delete(value)
    else next.add(value)

    setValueAllowedByColumn((prev) => {
      if (next.size === all.size) {
        const copy = { ...prev }
        delete copy[colId]
        return copy
      }
      return { ...prev, [colId]: next }
    })
  }

  const markAllValues = (colId) => {
    setValueAllowedByColumn((prev) => {
      const copy = { ...prev }
      delete copy[colId]
      return copy
    })
  }

  const clearAllValues = (colId) => {
    setValueAllowedByColumn((prev) => ({ ...prev, [colId]: new Set() }))
  }

  // No usar accessorKey: los títulos de Gravity suelen ser «1. ¿Pregunta…?»; TanStack
  // interpreta puntos como ruta anidada (a.b) y las celdas quedan vacías.
  const tableColumns = useMemo(
    () =>
      columns.map((key) => ({
        id: key,
        accessorFn: (row) => (row == null ? undefined : row[key]),
        header: key,
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: (row, columnId, filterValue) => {
          if (dateColumnKeys.has(columnId)) {
            return matchesDateColumnFilter(row.getValue(columnId), filterValue)
          }
          return matchesTextContains(row.getValue(columnId), filterValue)
        },
        cell: ({ getValue }) => {
          const v = getValue()
          const text = v == null ? '' : String(v)
          return (
            <span
              className="block min-w-[10rem] max-w-[min(40rem,85vw)] whitespace-pre-wrap break-words text-slate-800"
              title={text.length > 500 ? text : undefined}
            >
              {text}
            </span>
          )
        },
      })),
    [columns, dateColumnKeys],
  )

  const filteredRowsPrecheck = useMemo(() => {
    return rowsFilled.filter((r) => rowPassesValuePickers(r, columns, valueAllowedByColumn))
  }, [rowsFilled, columns, valueAllowedByColumn])

  const table = useReactTable({
    data: filteredRowsPrecheck,
    columns: tableColumns,
    state: { globalFilter, columnFilters },
    onGlobalFilterChange: setFilter,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? '').trim().toLowerCase()
      if (!q) return true
      return row.getAllCells().some((cell) => {
        const v = cell.getValue()
        if (v == null) return false
        return String(v).toLowerCase().includes(q)
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  useEffect(() => {
    if (!onFilteredRowsChange) return
    onFilteredRowsChange(table.getFilteredRowModel().rows.map((r) => r.original))
  }, [
    onFilteredRowsChange,
    table,
    filteredRowsPrecheck,
    globalFilter,
    columnFilters,
    valueAllowedByColumn,
  ])

  const filtered = table.getFilteredRowModel().rows.length
  const total = rows.length
  const hasOperatorColumnFilters = columnFilters.length > 0
  const hasAnyColumnFilter = hasOperatorColumnFilters || hasValueFilters
  const hasGlobalFilter = !!(globalFilter && String(globalFilter).trim())

  const clearColumnFilters = () => {
    table.setColumnFilters([])
    setValueAllowedByColumn({})
    setOpenValuePicker(null)
  }

  const clearAllFilters = () => {
    table.setColumnFilters([])
    setValueAllowedByColumn({})
    setOpenValuePicker(null)
    onGlobalFilterChange('')
  }

  const selectCls =
    'w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[0.7rem] font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/30'
  const filterInputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[0.7rem] text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/30'

  const pickerUniques = openValuePicker ? uniqueByColumn[openValuePicker] ?? [] : []
  const qNorm = pickerSearch.trim().toLowerCase()
  const filteredPickerValues = qNorm
    ? pickerUniques.filter((u) => u.toLowerCase().includes(qNorm))
    : pickerUniques
  const pickerAllowed = openValuePicker ? valueAllowedByColumn[openValuePicker] : undefined

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <label className="block text-sm font-semibold text-slate-800 lg:flex-1 lg:max-w-xl">
          Buscar en esta vista (cualquier columna)
          <input
            type="search"
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-inner shadow-slate-900/5 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"
            placeholder="Texto en cualquier columna…"
            value={globalFilter ?? ''}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearColumnFilters}
            disabled={!hasAnyColumnFilter}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quitar filtros de columnas
          </button>
          <button
            type="button"
            onClick={clearAllFilters}
            disabled={!hasAnyColumnFilter && !hasGlobalFilter}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quitar todo
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
            <span className="font-medium text-slate-500">Filas</span>
            <span className="font-bold tabular-nums text-slate-900">{filtered}</span>
            {filtered !== total && (
              <span className="text-slate-400">
                / <span className="tabular-nums text-slate-500">{total}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Solo la <strong className="text-slate-800">primera columna</strong> usa calendario y condiciones de fecha. El
        resto: un campo que filtra si el texto <strong className="text-slate-800">contiene</strong> lo escrito, más{' '}
        <strong className="text-indigo-800">valores únicos</strong>. Todo se combina con <strong className="text-slate-700">Y</strong>;
        la búsqueda global al final.
      </p>

      {openValuePicker && (
        <div className="mb-4 rounded-xl border-2 border-indigo-300/80 bg-white p-4 shadow-md shadow-indigo-900/10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Valores únicos</h3>
              <p className="text-xs text-slate-500">
                Columna: <span className="font-semibold text-indigo-800">{openValuePicker}</span> · {pickerUniques.length}{' '}
                distintos
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setOpenValuePicker(null)
                setPickerSearch('')
              }}
            >
              Cerrar
            </button>
          </div>
          <input
            type="search"
            className="mb-2 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            placeholder="Buscar en la lista…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
          />
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              onClick={() => markAllValues(openValuePicker)}
            >
              Marcar todas
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => clearAllValues(openValuePicker)}
            >
              Desmarcar todas
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPickerValues.map((v) => {
                const all = uniqueByColumn[openValuePicker] ?? []
                const checked = pickerAllowed === undefined || pickerAllowed.has(v)
                return (
                  <label
                    key={`${openValuePicker}-${v}`}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1 hover:bg-white"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                      checked={checked}
                      onChange={() => toggleValueAllowed(openValuePicker, v, all)}
                    />
                    <span className="break-all text-[0.75rem] leading-snug text-slate-800" title={v}>
                      {v}
                    </span>
                  </label>
                )
              })}
            </div>
            {filteredPickerValues.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">Nada coincide con la búsqueda.</p>
            )}
          </div>
          {pickerUniques.length > 400 && (
            <p className="mt-2 text-xs text-amber-800">Muchos valores distintos: usa la búsqueda para acotar.</p>
          )}
        </div>
      )}

      <div className="table-scroll-tl max-h-[min(70vh,720px)] overflow-auto rounded-xl border border-slate-200 bg-white shadow-inner shadow-slate-900/[0.03]">
        <table className="w-max min-w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-slate-200 bg-slate-100/95">
                {hg.headers.map((h) => {
                  const colId = h.column.id
                  const isDateCol = dateColumnKeys.has(colId)
                  const fv = h.column.getFilterValue()

                  let textContains = ''
                  if (!isDateCol) {
                    if (fv && typeof fv === 'object' && 'value' in fv) {
                      textContains = String(fv.value ?? '')
                    } else if (typeof fv === 'string') {
                      textContains = fv
                    }
                  }

                  let cur =
                    fv && typeof fv === 'object' && 'op' in fv
                      ? fv
                      : { op: 'dateEquals', value: '' }
                  if (isDateCol && !DATE_OP_SET.has(cur.op)) {
                    cur = { op: 'dateEquals', value: '' }
                  }

                  const op = cur.op || 'dateEquals'
                  const val = isDateCol ? cur.value ?? '' : textContains
                  const noValueInput = isDateCol && (op === 'empty' || op === 'notEmpty')
                  const hasPick = valueAllowedByColumn[colId] !== undefined

                  return (
                    <th
                      key={h.id}
                      className={`max-w-[14rem] min-w-[8rem] align-top border-r px-2 py-2 last:border-r-0 ${
                        isDateCol
                          ? 'border-teal-200/80 bg-teal-50/50 ring-1 ring-inset ring-teal-100'
                          : 'border-slate-200/80'
                      }`}
                    >
                      {isDateCol && (
                        <div className="mb-1">
                          <span
                            className="inline-block rounded bg-teal-600/90 px-1 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white"
                            title="Solo la primera columna: filtro con calendario"
                          >
                            Fecha
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        className={
                          h.column.getCanSort()
                            ? 'flex w-full cursor-pointer items-center gap-1 text-left font-semibold text-slate-800 transition hover:text-indigo-700 select-none'
                            : 'font-semibold text-slate-800'
                        }
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <span className="line-clamp-2 leading-tight">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </span>
                        {h.column.getIsSorted() === 'asc' ? (
                          <span className="shrink-0 text-indigo-600">▲</span>
                        ) : h.column.getIsSorted() === 'desc' ? (
                          <span className="shrink-0 text-indigo-600">▼</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className={`mt-2 w-full rounded-lg border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${
                          hasPick || openValuePicker === colId
                            ? 'border-indigo-400 bg-indigo-100 text-indigo-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                        }`}
                        onClick={() => {
                          setOpenValuePicker((p) => (p === colId ? null : colId))
                          setPickerSearch('')
                        }}
                      >
                        Valores únicos {hasPick ? '●' : ''}
                      </button>
                      <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        {isDateCol ? (
                          <>
                            <label className="block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Condición
                            </label>
                            <select
                              className={selectCls}
                              aria-label={`Condición de fecha para ${String(h.column.columnDef.header)}`}
                              value={op}
                              onChange={(e) => {
                                const newOp = e.target.value
                                if (newOp === 'empty' || newOp === 'notEmpty') {
                                  h.column.setFilterValue({ op: newOp, value: '' })
                                } else {
                                  const v = String(val).trim()
                                  if (!v) h.column.setFilterValue(undefined)
                                  else h.column.setFilterValue({ op: newOp, value: val })
                                }
                              }}
                            >
                              {FILTER_OPS_DATE.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="date"
                              className={`${filterInputCls} text-[0.75rem]`}
                              disabled={noValueInput}
                              value={noValueInput ? '' : val}
                              onChange={(e) => {
                                const v = e.target.value
                                if (!noValueInput && !v) {
                                  h.column.setFilterValue(undefined)
                                } else {
                                  h.column.setFilterValue({ op, value: v })
                                }
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <label className="block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Contiene
                            </label>
                            <input
                              className={filterInputCls}
                              placeholder="Texto…"
                              value={textContains}
                              onChange={(e) => {
                                const v = e.target.value
                                if (!v.trim()) {
                                  h.column.setFilterValue(undefined)
                                } else {
                                  h.column.setFilterValue({ op: 'contains', value: v })
                                }
                              }}
                            />
                          </>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={i % 2 === 0 ? 'bg-white hover:bg-indigo-50/40' : 'bg-slate-50/50 hover:bg-indigo-50/40'}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="align-top px-3 py-2.5 text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
