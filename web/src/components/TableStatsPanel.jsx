import { useMemo, useState } from 'react'
import { computeTableStats } from '../lib/tableStats.js'

function formatDayEs(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}

function BarList({ items, max, accentClass = 'bg-indigo-500' }) {
  if (!items.length) return <p className="text-sm text-slate-500">Sin datos.</p>
  const top = max ?? items[0]?.count ?? 1
  return (
    <ul className="space-y-2">
      {items.map(({ label, count }) => {
        const pct = top ? Math.min(100, Math.round((count / top) * 100)) : 0
        return (
          <li key={label} className="group">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800" title={label}>
                {label}
              </span>
              <span className="shrink-0 tabular-nums text-slate-600">{count}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full transition-all ${accentClass} opacity-90 group-hover:opacity-100`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 shadow-sm">
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-[0.7rem] text-slate-500">{hint}</p>}
    </div>
  )
}

/**
 * @param {object} props
 * @param {Record<string, unknown>[]} props.rows
 * @param {string[]} props.columns
 * @param {string} [props.sheetName]
 * @param {string} [props.viewHint]
 */
export default function TableStatsPanel({ rows, columns, sheetName, viewHint }) {
  const stats = useMemo(() => computeTableStats(rows, columns), [rows, columns])
  const [qInst, setQInst] = useState('')
  const [qGrado, setQGrado] = useState('')
  const [showAllDays, setShowAllDays] = useState(false)

  const qn = qInst.trim().toLowerCase()
  const filteredInst = useMemo(() => {
    if (!qn) return stats.byInstitution
    return stats.byInstitution.filter((x) => x.label.toLowerCase().includes(qn))
  }, [stats.byInstitution, qn])

  const qg = qGrado.trim().toLowerCase()
  const filteredGrado = useMemo(() => {
    if (!qg) return stats.byGrado
    return stats.byGrado.filter((x) => x.label.toLowerCase().includes(qg))
  }, [stats.byGrado, qg])

  const maxInst = filteredInst[0]?.count ?? 1
  const maxGrado = filteredGrado[0]?.count ?? 1
  const maxGrupo = stats.byGrupo[0]?.count ?? 1
  const maxGG = stats.byGradoGrupo[0]?.count ?? 1

  const { dateSummary } = stats
  const dayList = showAllDays ? dateSummary.byDay : dateSummary.byDay.slice(-10)

  const subtitle = [sheetName && `Hoja: ${sheetName}`, viewHint].filter(Boolean).join(' · ')

  if (!rows.length) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
        No hay filas en la vista actual para calcular estadísticas.
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-indigo-50/30 p-5 shadow-lg shadow-slate-900/[0.04] sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Panel de análisis</h2>
          <p className="mt-1 text-sm text-slate-600">
            Métricas sobre las <strong className="text-slate-800">filas visibles</strong> en la tabla (misma vista,
            pestaña y filtros aplicados en la cuadrícula).
          </p>
          {subtitle && (
            <p className="mt-2 inline-flex rounded-lg bg-slate-200/60 px-2.5 py-1 text-xs font-medium text-slate-700">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Filas en vista" value={stats.totalRows} />
        <Kpi
          label="Instituciones (distintas)"
          value={stats.institutionsDistinct}
          hint={stats.columnsPresent.institution ? undefined : 'Columna no presente'}
        />
        <Kpi
          label="Grados (distintos)"
          value={stats.gradosDistinct}
          hint={stats.columnsPresent.grado ? undefined : 'Columna no presente'}
        />
        <Kpi
          label="Respondentes (nombre único)"
          value={stats.uniqueRespondents ?? '—'}
          hint={stats.uniqueRespondents == null ? 'Sin columna de nombre' : undefined}
        />
      </div>

      {stats.uniqueEmails != null && (
        <p className="mt-3 text-xs text-slate-600">
          Correos distintos: <strong className="tabular-nums text-slate-800">{stats.uniqueEmails}</strong>
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <details open className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-slate-900">
            Por institución educativa
          </summary>
          {!stats.columnsPresent.institution ? (
            <p className="mt-3 text-sm text-amber-800">No hay columna «Institución o colegio» en esta hoja.</p>
          ) : (
            <>
              <input
                type="search"
                placeholder="Buscar institución…"
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                value={qInst}
                onChange={(e) => setQInst(e.target.value)}
              />
              <div className="mt-4 max-h-72 overflow-y-auto pr-1">
                <BarList items={filteredInst} max={maxInst} />
              </div>
            </>
          )}
        </details>

        <details open className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-slate-900">Por grado (y curso)</summary>
          {!stats.columnsPresent.grado ? (
            <p className="mt-3 text-sm text-amber-800">No hay columna «Grado» en esta hoja.</p>
          ) : (
            <>
              <input
                type="search"
                placeholder="Buscar grado…"
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                value={qGrado}
                onChange={(e) => setQGrado(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">Respuestas por valor de «Grado».</p>
              <div className="mt-3 max-h-56 overflow-y-auto pr-1">
                <BarList items={filteredGrado} max={maxGrado} accentClass="bg-emerald-500" />
              </div>
              {stats.columnsPresent.grupo && stats.byGrupo.length > 0 && (
                <>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Por número o letra de grupo
                  </p>
                  <div className="mt-2 max-h-48 overflow-y-auto pr-1">
                    <BarList items={stats.byGrupo} max={maxGrupo} accentClass="bg-sky-500" />
                  </div>
                </>
              )}
              {stats.byGradoGrupo.length > 0 && (
                <>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Grado + grupo combinado
                  </p>
                  <div className="mt-2 max-h-48 overflow-y-auto pr-1">
                    <BarList items={stats.byGradoGrupo.slice(0, 25)} max={maxGG} accentClass="bg-violet-500" />
                  </div>
                </>
              )}
            </>
          )}
        </details>
      </div>

      <details open className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">
          Fechas de envío / registro
        </summary>
        {!dateSummary.hasDates ? (
          <p className="mt-3 text-sm text-slate-600">
            {stats.dateColumnName
              ? 'No se pudieron interpretar fechas suficientes en la columna detectada.'
              : 'No se detectó una columna de fechas interpretable en esta vista.'}
            {stats.dateColumnName && (
              <span className="block text-xs text-slate-500">Columna usada: «{stats.dateColumnName}»</span>
            )}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi
                label="Primera fecha (más antigua)"
                value={formatDayEs(dateSummary.minDay)}
                hint={dateSummary.minDay ? `ISO ${dateSummary.minDay}` : undefined}
              />
              <Kpi
                label="Última fecha (más reciente)"
                value={formatDayEs(dateSummary.maxDay)}
                hint={dateSummary.maxDay ? `ISO ${dateSummary.maxDay}` : undefined}
              />
              <Kpi
                label="Rango calendario"
                value={dateSummary.daySpanDays != null ? `${dateSummary.daySpanDays} días` : '—'}
                hint={
                  dateSummary.minDay && dateSummary.maxDay
                    ? `Entre ${formatDayEs(dateSummary.minDay)} y ${formatDayEs(dateSummary.maxDay)}`
                    : undefined
                }
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Día con más envíos</p>
                {dateSummary.peakDay ? (
                  <p className="mt-2 text-lg font-bold text-emerald-950">
                    {formatDayEs(dateSummary.peakDay.day)}{' '}
                    <span className="text-base font-semibold text-emerald-800">
                      ({dateSummary.peakDay.count} respuestas)
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">—</p>
                )}
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                  Día con menos envíos (entre días con actividad)
                </p>
                {dateSummary.quietestDay ? (
                  <p className="mt-2 text-lg font-bold text-amber-950">
                    {formatDayEs(dateSummary.quietestDay.day)}{' '}
                    <span className="text-base font-semibold text-amber-900/90">
                      ({dateSummary.quietestDay.count} respuesta
                      {dateSummary.quietestDay.count !== 1 ? 's' : ''})
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">—</p>
                )}
                <p className="mt-2 text-[0.65rem] text-amber-900/80">
                  Solo se consideran días que aparecen al menos una vez en los datos.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Filas con fecha válida:{' '}
              <strong className="text-slate-800">{dateSummary.totalWithValidDate}</strong> de {stats.totalRows}.
              Días distintos con al menos un envío:{' '}
              <strong className="text-slate-800">{dateSummary.daysWithActivity}</strong>.
            </p>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Actividad por día {showAllDays ? '(todos)' : '(últimos 10 días con datos)'}
                </p>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowAllDays((s) => !s)}
                >
                  {showAllDays ? 'Ver solo últimos 10' : 'Ver todos los días'}
                </button>
              </div>
              <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-slate-700">Fecha</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Nº respuestas</th>
                      <th className="hidden px-3 py-2 font-semibold text-slate-700 sm:table-cell">Barras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dayList.map(({ day, count }) => {
                      const peak = dateSummary.peakDay?.day === day
                      const quiet = dateSummary.quietestDay?.day === day && count === dateSummary.quietestDay.count
                      const barMax = dateSummary.peakDay?.count || 1
                      const pct = Math.round((count / barMax) * 100)
                      return (
                        <tr
                          key={day}
                          className={
                            peak
                              ? 'bg-emerald-50/80'
                              : quiet
                                ? 'bg-amber-50/70'
                                : 'bg-white hover:bg-slate-50/80'
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                            {formatDayEs(day)}
                            {peak && (
                              <span className="ml-1 rounded bg-emerald-600 px-1 py-0.5 text-[0.6rem] font-bold text-white">
                                Pico
                              </span>
                            )}
                            {quiet && !peak && (
                              <span className="ml-1 rounded bg-amber-600 px-1 py-0.5 text-[0.6rem] font-bold text-white">
                                Mín.
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-700">{count}</td>
                          <td className="hidden px-3 py-2 sm:table-cell">
                            <div className="h-2 w-full max-w-[120px] rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </details>
    </div>
  )
}
