import { useMemo, useState } from 'react'
import Plot from 'react-plotly.js'
import { apiUrl } from '../lib/apiBase.js'

const fileInputClass =
  'mt-2 block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600 transition file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-indigo-300 hover:bg-indigo-50/30 file:hover:bg-indigo-700'

function ProgressBar({ value }) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  const tone =
    safeValue >= 80
      ? 'bg-emerald-500'
      : safeValue >= 50
        ? 'bg-amber-500'
        : safeValue >= 25
          ? 'bg-orange-500'
          : 'bg-rose-500'
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${safeValue}%` }} />
    </div>
  )
}

function DonutProgress({ value, size = 108, stroke = 16 }) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - safeValue / 100)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#0284c7"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-slate-800">{Math.round(safeValue)}%</span>
      </div>
    </div>
  )
}

export default function ProgressDashboard() {
  const [sourceFile, setSourceFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedComponent, setSelectedComponent] = useState('')
  const [selectedActivityKey, setSelectedActivityKey] = useState('')

  const loadProgress = async () => {
    setError('')
    setData(null)
    if (!sourceFile) {
      setError('Primero sube un Excel para generar el panel de progreso.')
      return
    }

    setBusy(true)
    try {
      const formData = new FormData()
      formData.append('source', sourceFile)
      const response = await fetch(apiUrl('/api/progress-summary'), {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const txt = await response.text()
        throw new Error(txt || response.statusText)
      }
      const json = await response.json()
      setData(json)
      const firstSchool = json?.school_progress?.[0]?.school ?? ''
      const firstComponent = json?.component_progress?.[0]?.component ?? ''
      const firstActivity = json?.activity_progress?.[0]
      setSelectedSchool(firstSchool)
      setSelectedComponent(firstComponent)
      setSelectedActivityKey(firstActivity ? `${firstActivity.component}|${firstActivity.no_act}|${firstActivity.activity}` : '')
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const topComponents = useMemo(
    () => (data?.component_progress ?? []).slice().sort((a, b) => b.progress_pct - a.progress_pct),
    [data],
  )

  const lowestActivities = useMemo(() => (data?.activity_progress ?? []).slice(0, 8), [data])
  const schoolsByProgress = useMemo(() => data?.school_progress ?? [], [data])

  const selectedSchoolData = useMemo(
    () => schoolsByProgress.find((row) => row.school === selectedSchool) ?? null,
    [schoolsByProgress, selectedSchool],
  )

  const selectedComponentData = useMemo(
    () => topComponents.find((row) => row.component === selectedComponent) ?? null,
    [topComponents, selectedComponent],
  )

  const selectedActivityData = useMemo(
    () =>
      lowestActivities.find(
        (row) => `${row.component}|${row.no_act}|${row.activity}` === selectedActivityKey,
      ) ?? null,
    [lowestActivities, selectedActivityKey],
  )

  const selectedSchoolComponentBreakdown = selectedSchoolData?.component_breakdown ?? []
  const selectedComponentSchoolBreakdown = selectedComponentData?.school_breakdown ?? []
  const selectedActivityCompletedSchools = selectedActivityData?.completed_school_names ?? []
  const selectedActivityPendingSchools = selectedActivityData?.pending_school_names ?? []

  const groupedActivityChart = useMemo(() => {
    const activities = data?.activity_progress ?? []
    if (!schoolsByProgress.length || !activities.length) return { traces: [] }
    const schools = schoolsByProgress.map((item) => item.school)
    const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
    const traces = schools.map((school, idx) => ({
      type: 'bar',
      name: school,
      x: activities.map((_, index) => `Act ${index + 1}`),
      y: activities.map((activity) =>
        (activity.completed_school_names ?? []).includes(school) ? 100 : 0,
      ),
      marker: { color: palette[idx % palette.length] },
      customdata: activities.map((activity) => [
        activity.component,
        activity.no_act,
        activity.activity,
      ]),
      hovertemplate:
        'Colegio: ' +
        school +
        '<br>Componente: %{customdata[0]}' +
        '<br>No Act: %{customdata[1]}' +
        '<br>Actividad: %{customdata[2]}' +
        '<br>Estado: %{y:.0f}%<extra></extra>',
    }))
    return { traces }
  }, [data, schoolsByProgress])

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-6 shadow-lg shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.03] backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Panel de progreso ATILA</h2>
          <p className="mt-1 text-sm text-slate-600">
            Enfoque principal en barras de progreso por componente y actividad, con alternativas visuales.
          </p>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Plotly + Python</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="block text-sm font-semibold text-slate-800">
          Excel base para progreso (ATILA)
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className={fileInputClass}
            onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          onClick={loadProgress}
          disabled={busy}
          className="inline-flex h-fit items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Procesando...' : 'Construir panel'}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">% global</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.overall_progress_pct}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Componentes</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.components_count}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Actividades</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.activities_count}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Colegios</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.schools_count}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Casillas completadas</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {data.summary.completed_slots} / {data.summary.total_slots}
              </p>
            </div>
          </div>

          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Colegios (clic para detalle)</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {schoolsByProgress.map((item) => {
                const active = item.school === selectedSchool
                return (
                  <button
                    key={item.school}
                    type="button"
                    onClick={() => setSelectedSchool(item.school)}
                    className={
                      active
                        ? 'rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-left'
                        : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-slate-300'
                    }
                  >
                    <p className="text-sm font-semibold text-slate-800">{item.school}</p>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      {item.progress_pct}% · {item.completed_slots}/{item.total_slots}
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar value={item.progress_pct} />
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedSchoolData && (
              <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                <p className="text-sm font-semibold text-slate-900">Detalle de {selectedSchoolData.school}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Componentes trabajados por este colegio:
                </p>
                <div className="mt-2 space-y-1.5">
                  {selectedSchoolComponentBreakdown.map((item) => (
                    <div key={`${selectedSchoolData.school}-${item.component}`}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-700">{item.component}</p>
                        <p className="text-xs font-bold text-slate-800">{item.progress_pct}%</p>
                      </div>
                      <ProgressBar value={item.progress_pct} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Progreso por componente (principal, clic para detalle)</h3>
              <div className="mt-4 space-y-3">
                {topComponents.map((item) => (
                  <button
                    key={item.component}
                    type="button"
                    onClick={() => setSelectedComponent(item.component)}
                    className={
                      item.component === selectedComponent
                        ? 'w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-left'
                        : 'w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:border-slate-300'
                    }
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">{item.component}</p>
                      <p className="text-sm font-bold text-slate-900">{item.progress_pct}%</p>
                    </div>
                    <ProgressBar value={item.progress_pct} />
                    <p className="mt-1 text-xs text-slate-500">
                      {item.activities_count} actividades · {item.completed_slots}/{item.total_slots} avances
                    </p>
                  </button>
                ))}
              </div>
              {selectedComponentData && (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Detalle por colegio · {selectedComponentData.component}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {selectedComponentSchoolBreakdown.map((item) => (
                      <div key={`${selectedComponentData.component}-${item.school}`}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-slate-700">{item.school}</p>
                          <p className="text-xs font-bold text-slate-800">{item.progress_pct}%</p>
                        </div>
                        <ProgressBar value={item.progress_pct} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Alternativa 1: barras horizontales (Plotly)</h3>
              <Plot
                data={[
                  {
                    type: 'bar',
                    orientation: 'h',
                    x: topComponents.map((item) => item.progress_pct),
                    y: topComponents.map((item) => item.component),
                    marker: { color: '#4f46e5' },
                    text: topComponents.map((item) => `${item.progress_pct}%`),
                    textposition: 'outside',
                    cliponaxis: false,
                  },
                ]}
                layout={{
                  margin: { l: 130, r: 20, t: 10, b: 35 },
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  plot_bgcolor: 'rgba(0,0,0,0)',
                  xaxis: { range: [0, 100], title: '% avance' },
                  yaxis: { automargin: true },
                  height: 320,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
                useResizeHandler
              />
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-900">
                  Tarjetas por colegio (estilo barra de progreso)
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Vista rápida del avance de cada colegio, similar al formato que compartiste.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {schoolsByProgress.map((schoolRow) => {
                    const activeBlocks = Math.round((schoolRow.progress_pct ?? 0) / 10)
                    const topSchoolComponent = (schoolRow.component_breakdown ?? [])[0]
                    return (
                      <div
                        key={`school-card-${schoolRow.school}`}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                      >
                        <p className="text-sm font-semibold text-slate-800">{schoolRow.school}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <DonutProgress value={schoolRow.progress_pct} />
                          <div className="space-y-1 text-xs text-slate-700">
                            <p>
                              <strong className="text-slate-900">Actividades realizadas:</strong>{' '}
                              {schoolRow.completed_slots}
                            </p>
                            <p>
                              <strong className="text-slate-900">Total de actividades:</strong>{' '}
                              {schoolRow.total_slots}
                            </p>
                            <p>
                              <strong className="text-slate-900">Componente mas activo:</strong>{' '}
                              {topSchoolComponent?.component ?? 'Sin dato'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="grid grid-cols-10 gap-1 rounded-lg bg-white p-1.5">
                            {Array.from({ length: 10 }, (_, idx) => (
                              <span
                                key={`block-${schoolRow.school}-${idx}`}
                                className={
                                  idx < activeBlocks
                                    ? 'h-5 rounded-sm bg-amber-400'
                                    : 'h-5 rounded-sm bg-slate-200'
                                }
                              />
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Progreso: {schoolRow.progress_pct}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </article>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Alternativa 2: barras agrupadas por colegio y actividad
              </h3>
              <Plot
                data={groupedActivityChart.traces}
                layout={{
                  barmode: 'group',
                  margin: { l: 40, r: 20, t: 10, b: 130 },
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  plot_bgcolor: 'rgba(0,0,0,0)',
                  xaxis: { tickangle: -30, automargin: true, title: 'Actividades (Act 1, Act 2...)' },
                  yaxis: { automargin: true, title: '% avance', range: [0, 100] },
                  height: 420,
                  legend: { orientation: 'h', y: 1.2 },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
                useResizeHandler
              />
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Actividades con menor avance (clic para ver colegios)
              </h3>
              <div className="mt-3 space-y-2">
                {lowestActivities.map((item) => (
                  <button
                    key={`${item.component}-${item.no_act}-${item.activity}`}
                    type="button"
                    onClick={() => setSelectedActivityKey(`${item.component}|${item.no_act}|${item.activity}`)}
                    className={
                      selectedActivityKey === `${item.component}|${item.no_act}|${item.activity}`
                        ? 'w-full rounded-lg border border-indigo-300 bg-indigo-50 p-2.5 text-left'
                        : 'w-full rounded-lg border border-slate-100 p-2.5 text-left hover:border-slate-300'
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">
                        {item.component} {item.no_act ? `· Act ${item.no_act}` : ''}
                      </p>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {item.progress_pct}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{item.activity}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.completed_schools}/{item.total_schools} colegios · Programada: {item.planned_date || 'Sin fecha'}
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar value={item.progress_pct} />
                    </div>
                  </button>
                ))}
              </div>
              {selectedActivityData && (
                <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Colegios en "{selectedActivityData.activity}"
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Completado ({selectedActivityCompletedSchools.length})
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {selectedActivityCompletedSchools.join(' · ') || 'Ninguno'}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Pendiente ({selectedActivityPendingSchools.length})
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {selectedActivityPendingSchools.join(' · ') || 'Ninguno'}
                  </p>
                </div>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  )
}
