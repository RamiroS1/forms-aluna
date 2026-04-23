import { useCallback, useEffect, useMemo, useState } from 'react'
import SheetTable from './components/SheetTable.jsx'
import TableStatsPanel from './components/TableStatsPanel.jsx'
import { canGroupByGrade, splitRowsByGradeGroup } from './lib/gradeGroup.js'
import { uniqueInstitutionsSorted } from './lib/tableStats.js'
import { parseDataFile } from './lib/parseWorkbook.js'
import { apiUrl, isProductionMissingApiUrl } from './lib/apiBase.js'

const defaultTitle =
  'No es madera, pero parece: así es la ‘revolución plástica’ que llegó al campo'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-900/5 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25'

const fileInputClass =
  'mt-2 block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600 transition file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-indigo-300 hover:bg-indigo-50/30 file:hover:bg-indigo-700'

export default function App() {
  const [adminFile, setAdminFile] = useState(null)
  const [templateFile, setTemplateFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [activeSheet, setActiveSheet] = useState('')
  const [sheetFilter, setSheetFilter] = useState('')
  const [globalSearch, setGlobalSearch] = useState({})
  const [institution, setInstitution] = useState('')
  const [readingTitle, setReadingTitle] = useState(defaultTitle)
  const [reportDate, setReportDate] = useState('02 de marzo')
  const [asignatura, setAsignatura] = useState('LENGUA CASTELLANA')
  const [docente, setDocente] = useState('')
  const [elaboradoPor, setElaboradoPor] = useState('')
  const [exportMode, setExportMode] = useState('single')
  const [institutionLabel, setInstitutionLabel] = useState('')
  const [includeOthers, setIncludeOthers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [apiMsg, setApiMsg] = useState(null)
  const [apiErr, setApiErr] = useState(null)
  const [dataViewMode, setDataViewMode] = useState('excel')
  const [activeGradeSegment, setActiveGradeSegment] = useState('')
  const [statsRows, setStatsRows] = useState([])
  const [zipInstitutionSelected, setZipInstitutionSelected] = useState([])

  const onAdminPicked = useCallback(async (file) => {
    setAdminFile(file)
    setParsed(null)
    setActiveSheet('')
    setGlobalSearch({})
    setDataViewMode('excel')
    setActiveGradeSegment('')
    if (!file) return
    const buf = await file.arrayBuffer()
    const data = parseDataFile(buf, file.name || '')
    setParsed(data)
    if (data.names.length) {
      setActiveSheet(data.names[0])
      setGlobalSearch({})
    }
  }, [])

  const activeMeta = parsed && activeSheet ? parsed.sheets[activeSheet] : null
  const canGroup = !!(activeMeta && canGroupByGrade(activeMeta.columns))

  const firstSheetMeta = useMemo(() => {
    if (!parsed?.names?.length) return null
    return parsed.sheets[parsed.names[0]] ?? null
  }, [parsed])

  const zipInstitutionOptions = useMemo(() => {
    if (!firstSheetMeta) return []
    return uniqueInstitutionsSorted(firstSheetMeta.rows, firstSheetMeta.columns)
  }, [firstSheetMeta])

  const zipOptsKey = useMemo(() => zipInstitutionOptions.join('\u0000'), [zipInstitutionOptions])

  useEffect(() => {
    setZipInstitutionSelected([...zipInstitutionOptions])
  }, [zipOptsKey])

  const gradeSplit = useMemo(() => {
    if (!activeMeta || !canGroupByGrade(activeMeta.columns)) return null
    return splitRowsByGradeGroup(activeMeta.rows, institution, !includeOthers)
  }, [activeMeta, institution, includeOthers])

  const gradeTabOrder = useMemo(() => {
    if (!gradeSplit) return []
    const { sortedKeys, otros, otrosTitle } = gradeSplit
    const t = [...sortedKeys]
    if (otros.length) t.push(otrosTitle)
    return t
  }, [gradeSplit])

  useEffect(() => {
    setActiveGradeSegment('')
    if (!canGroupByGrade(activeMeta?.columns ?? [])) setDataViewMode('excel')
  }, [activeSheet, activeMeta])

  useEffect(() => {
    if (dataViewMode !== 'grado' || !gradeTabOrder.length) return
    if (!activeGradeSegment || !gradeTabOrder.includes(activeGradeSegment)) {
      setActiveGradeSegment(gradeTabOrder[0])
    }
  }, [dataViewMode, gradeTabOrder, activeGradeSegment])

  useEffect(() => {
    if (dataViewMode === 'grado' && gradeSplit && gradeTabOrder.length === 0) {
      setDataViewMode('excel')
    }
  }, [dataViewMode, gradeSplit, gradeTabOrder.length])

  const displayRows = useMemo(() => {
    if (!activeMeta) return []
    if (dataViewMode !== 'grado' || !gradeSplit) return activeMeta.rows
    if (activeGradeSegment === gradeSplit.otrosTitle) return gradeSplit.otros
    return gradeSplit.buckets[activeGradeSegment] ?? []
  }, [activeMeta, dataViewMode, gradeSplit, activeGradeSegment])

  const tableSearchKey = useMemo(() => {
    if (!activeSheet) return ''
    if (dataViewMode === 'grado' && activeGradeSegment) {
      return `${activeSheet}|grado|${activeGradeSegment}`
    }
    return `${activeSheet}|excel|full`
  }, [activeSheet, dataViewMode, activeGradeSegment])

  const statsViewHint = useMemo(() => {
    if (dataViewMode === 'grado' && activeGradeSegment) {
      return `Vista por grado‑grupo: ${activeGradeSegment}`
    }
    return 'Vista: hoja completa'
  }, [dataViewMode, activeGradeSegment])

  useEffect(() => {
    setStatsRows(displayRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when sheet/grado view changes; other displayRows updates flow through SheetTable filters.
  }, [tableSearchKey])

  const filterNorm = sheetFilter.trim().toLowerCase()

  const visibleSheetNames = useMemo(() => {
    if (!parsed) return []
    if (!filterNorm) return parsed.names
    return parsed.names.filter((n) => n.toLowerCase().includes(filterNorm))
  }, [parsed, filterNorm])

  useEffect(() => {
    if (!parsed || !visibleSheetNames.length) return
    if (!activeSheet || !visibleSheetNames.includes(activeSheet)) {
      setActiveSheet(visibleSheetNames[0])
    }
  }, [parsed, visibleSheetNames, activeSheet])

  const buildReport = async () => {
    setApiMsg(null)
    setApiErr(null)
    if (isProductionMissingApiUrl()) {
      setApiErr(
        'Falta la variable VITE_API_BASE_URL en Vercel: es la URL pública de tu API FastAPI (sin barra al final). Añádela en el proyecto Vercel → Settings → Environment Variables, vuelve a desplegar, y asegúrate de que CORS en la API permita tu dominio *.vercel.app.',
      )
      return
    }
    if (!adminFile) {
      setApiErr('Sube primero el Excel del administrador.')
      return
    }
    if (exportMode === 'zip_by_institution' && zipInstitutionOptions.length > 0 && zipInstitutionSelected.length === 0) {
      setApiErr('Marca al menos un colegio en el ZIP o vuelve al modo de un solo informe.')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('admin', adminFile)
      if (templateFile) fd.append('template', templateFile)
      fd.append('institution_contains', institution)
      fd.append('reading_title', readingTitle)
      fd.append('report_date', reportDate)
      fd.append('asignatura', asignatura)
      fd.append('docente', docente)
      fd.append('elaborado_por', elaboradoPor)
      fd.append('institution_label', institutionLabel)
      fd.append('export_mode', exportMode)
      fd.append('only_primary_institution', includeOthers ? 'false' : 'true')
      if (exportMode === 'zip_by_institution' && zipInstitutionOptions.length > 0) {
        fd.append('zip_institutions_json', JSON.stringify(zipInstitutionSelected))
      }

      const res = await fetch(apiUrl('/api/build-report'), { method: 'POST', body: fd })
      if (!res.ok) {
        const t = await res.text()
        if (res.status === 404 && (t.includes('Not Found') || t.includes('"detail"'))) {
          throw new Error(
            'API no encontrada en esta URL. Revisa VITE_API_BASE_URL en Vercel (debe apuntar a tu servidor FastAPI, no a la URL del front).',
          )
        }
        throw new Error(t || res.statusText)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const stem = adminFile.name.replace(/\.(xlsx|xlsm|csv|xls)$/i, '') || 'informe'
      a.download =
        exportMode === 'zip_by_institution'
          ? `informe_lecturas_por_colegio_${stem}.zip`
          : `informe_lecturas_${stem}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setApiMsg(
        exportMode === 'zip_by_institution'
          ? 'Se descargó un ZIP con un Excel por colegio (columna «Institución o colegio»).'
          : 'Informe generado y descargado.',
      )
    } catch (e) {
      setApiErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const checkHealth = async () => {
    setApiErr(null)
    if (isProductionMissingApiUrl()) {
      setApiErr(
        'En Vercel, añade la variable VITE_API_BASE_URL con la URL pública de tu API (p. ej. https://forms-aluna-api.onrender.com) y vuelve a desplegar. En local, usa npm run dev con la API en el puerto 8001 (proxy en vite.config).',
      )
      return
    }
    try {
      const r = await fetch(apiUrl('/api/health'))
      if (!r.ok) {
        const t = await r.text()
        if (r.status === 404) {
          setApiErr(
            'No hay API en esta URL. Si desplegaste solo el front en Vercel, VITE_API_BASE_URL debe ser la base de tu FastAPI (Render/Railway/Fly, etc.), no la URL de la web.',
          )
          return
        }
        setApiErr(t || r.statusText)
        return
      }
      const j = await r.json()
      setApiMsg(
        j.default_template_exists
          ? 'API en línea. Plantilla por defecto disponible en el servidor.'
          : 'API en línea. Falta FORMATO_LEC en la carpeta del proyecto; sube plantilla al generar.',
      )
    } catch {
      setApiErr(
        'No se pudo conectar con la API. En local: python3 -m uvicorn api.main:app --port 8001 (carpeta automation). En Vercel: configura VITE_API_BASE_URL y CORS en el servidor de la API.',
      )
    }
  }

  const cardClass =
    'rounded-2xl border border-slate-200/90 bg-white/90 p-6 shadow-lg shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.03] backdrop-blur-sm'

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 text-slate-900 antialiased">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgb(224,231,255),transparent)]" />
        <div className="absolute -left-40 top-1/3 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-indigo-200/35 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        {isProductionMissingApiUrl() && (
          <div
            className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
            role="status"
          >
            <p className="font-semibold">Falta configurar la API en Vercel</p>
            <p className="mt-1 leading-relaxed text-amber-900/95">
              El front no incluye el backend Python. En Vercel → Project → Settings → Environment Variables, crea{' '}
              <code className="rounded bg-amber-100/90 px-1.5 py-0.5 font-mono text-xs">VITE_API_BASE_URL</code> con la
              URL base de tu FastAPI (sin <code className="font-mono">/</code> al final) y vuelve a desplegar. Añade tu
              dominio en CORS de la API si hace falta.
            </p>
          </div>
        )}
        <header className="mb-10 lg:mb-12">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-emerald-50/35 to-sky-50/45 p-6 shadow-xl shadow-slate-900/[0.06] ring-1 ring-white/70 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-lime-300/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-sky-300/25 blur-3xl"
            />
            <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-10 xl:gap-14">
              <a
                href="/"
                className="group flex shrink-0 justify-center lg:justify-start"
                aria-label="Aluna — inicio"
              >
                <span className="rounded-2xl bg-white/75 px-7 py-4 shadow-md shadow-slate-900/[0.07] ring-1 ring-slate-200/50 backdrop-blur-md transition duration-200 group-hover:bg-white/95 group-hover:shadow-lg group-hover:ring-slate-300/60 sm:px-8 sm:py-5">
                  <img
                    src="/aluna-logo.png"
                    alt="Aluna"
                    className="mx-auto h-10 w-auto max-w-[min(100%,280px)] object-contain object-center sm:h-12"
                  />
                </span>
              </a>
              <div
                className="h-px w-full max-w-xs bg-gradient-to-r from-transparent via-slate-300/80 to-transparent lg:hidden"
                aria-hidden
              />
              <div
                className="hidden w-px shrink-0 self-stretch min-h-[7rem] bg-gradient-to-b from-transparent via-slate-200/70 to-transparent lg:block"
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/90 bg-white/85 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-indigo-700 shadow-sm backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.400)]" />
                  Excel administrador → plantilla FORMATO_LEC
                </div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:mt-5 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                  Informe de lecturas
                </h1>
                <p className="mt-3 max-w-2xl text-base text-slate-600 sm:text-lg mx-auto lg:mx-0">
                  Vista previa de todas las hojas, búsqueda y orden en tabla, y generación del informe listo para enviar.
                </p>
              </div>
            </div>
          </div>
        </header>

        <>
            <section className={`${cardClass} mb-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <h2 className="text-lg font-semibold text-slate-900">Archivos</h2>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              .xlsx · .xlsm · .csv
            </span>
          </div>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800">
              Excel administrador <span className="font-normal text-rose-600">(requerido)</span>
              <input
                type="file"
                accept=".xlsx,.xlsm,.csv"
                className={fileInputClass}
                onChange={(e) => onAdminPicked(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Plantilla FORMATO_LEC <span className="font-normal text-slate-500">(opcional)</span>
              <input
                type="file"
                accept=".xlsx"
                className={fileInputClass}
                onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="mt-5 space-y-2 text-sm leading-relaxed text-slate-500">
            <p>
              <strong className="font-semibold text-slate-700">Excel administrador:</strong> export de respuestas (cada
              lectura o cuento puede traer columnas de preguntas distintas). Debe conservar «Institución o colegio»,
              «Grado» e «Indica el número o letra del grado» tal como salen del formulario.
            </p>
            <p>
              <strong className="font-semibold text-slate-700">Plantilla (opcional):</strong> solo el .xlsx de
              maquetación del informe (hoja «10-1» o una sola hoja con celdas B7, D2, I2 a I4, datos desde fila 8). No
              subas aquí el mismo archivo de respuestas.
            </p>
            <p>
              Si no subes plantilla, el servidor usa{' '}
              <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                FORMATO_LEC_AURELIO MARTÍNEZ MUTIS.xlsx
              </code>{' '}
              en la carpeta del proyecto.
            </p>
          </div>
            </section>

            <section className={`${cardClass} mb-6`}>
          <h2 className="border-b border-slate-100 pb-4 text-lg font-semibold text-slate-900">
            Parámetros del informe
          </h2>
          <p className="mt-4 text-sm text-slate-600">
            Estos valores se envían al generar el Excel (no afectan la tabla de vista previa). Si el informe sale vacío,
            suele ser porque el texto de institución no aparece en la columna «Institución o colegio» del archivo.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-800">
              Institución (contiene)
              <input className={inputClass} value={institution} onChange={(e) => setInstitution(e.target.value)} />
              <span className="mt-1.5 block text-xs font-normal text-slate-500">
                Debe ser un fragmento del nombre tal como viene en el Excel (sin tilde obligatoria: la comparación no
                distingue mayúsculas). Si lo dejas vacío, se consideran todas las filas. Si marcas «Incluir otras
                instituciones», el resto de colegios va a la hoja OTROS.
              </span>
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Título de la lectura (celda B7)
              <textarea
                className={`${inputClass} min-h-[4.5rem] resize-y`}
                value={readingTitle}
                onChange={(e) => setReadingTitle(e.target.value)}
                rows={2}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Fecha del informe (celda L7)
              <input className={inputClass} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Asignatura (celda I2, junto a «ASIGNATURA»)
              <input
                className={inputClass}
                value={asignatura}
                onChange={(e) => setAsignatura(e.target.value)}
                placeholder="Ej. Lengua castellana"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Docente (celda I3, junto a «DOCENTE»)
              <input
                className={inputClass}
                value={docente}
                onChange={(e) => setDocente(e.target.value)}
                placeholder="Nombre del docente"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Elaborado por (celda I4, junto a «ELABORADO POR»; no es la asignatura)
              <input
                className={inputClass}
                value={elaboradoPor}
                onChange={(e) => setElaboradoPor(e.target.value)}
                placeholder="Quien firma o elabora el informe"
              />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Exportación</p>
              <p className="mt-1 text-xs text-slate-500">
                Si el archivo trae varios colegios, puedes bajar un <strong>ZIP</strong> con un Excel por
                institución (mismos textos B7, fechas, docente, etc. en todos; en <strong>D2</strong> se escribe
                el nombre de cada colegio, no un texto fijo de plantilla).
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="exportMode"
                    className="h-4 w-4 text-indigo-600"
                    checked={exportMode === 'single'}
                    onChange={() => setExportMode('single')}
                  />
                  Un solo informe (un .xlsx)
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="exportMode"
                    className="h-4 w-4 text-indigo-600"
                    checked={exportMode === 'zip_by_institution'}
                    onChange={() => setExportMode('zip_by_institution')}
                  />
                  Un Excel por colegio (.zip)
                </label>
              </div>
            </div>
            {exportMode === 'single' && (
              <label className="block text-sm font-semibold text-slate-800">
                Nombre de institución en portada (celda D2, opcional)
                <input
                  className={inputClass}
                  value={institutionLabel}
                  onChange={(e) => setInstitutionLabel(e.target.value)}
                  placeholder="Si lo dejas vacío, no se sustituye el nombre en D2 (p. ej. texto de la plantilla de ejemplo)"
                />
              </label>
            )}
            {exportMode === 'zip_by_institution' && (
              <>
                <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                  En este modo se ignoran «Institución (contiene)» e «Incluir otras en OTROS» al partir por colegio: cada
                  archivo solo lleva filas cuyo «Institución o colegio» coincide exactamente con ese centro. En la portada
                  (celda D2) irá el nombre de cada colegio, sustituyendo el texto fijo de la plantilla aunque D2 esté
                  en celdas fusionadas.
                </p>
                {zipInstitutionOptions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">Colegios a incluir en el ZIP</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Valores de «Institución o colegio» en la primera hoja del administrador
                      {parsed?.names?.length > 1
                        ? ` (${parsed.names[0]}; el informe se genera a partir de esa hoja, como al subir a la API).`
                        : ' (la misma que usa el generador).'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        className="font-medium text-indigo-600 underline"
                        onClick={() => setZipInstitutionSelected([...zipInstitutionOptions])}
                      >
                        Seleccionar todas
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        className="font-medium text-indigo-600 underline"
                        onClick={() => setZipInstitutionSelected([])}
                      >
                        Ninguna
                      </button>
                    </div>
                    <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {zipInstitutionOptions.map((name) => (
                        <li key={name} className="flex items-start gap-2.5 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                            checked={zipInstitutionSelected.includes(name)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setZipInstitutionSelected((p) => [...p, name])
                              } else {
                                setZipInstitutionSelected((p) => p.filter((x) => x !== name))
                              }
                            }}
                          />
                          <span className="min-w-0 break-words leading-snug">{name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                checked={includeOthers}
                onChange={(e) => setIncludeOthers(e.target.checked)}
              />
              <span>
                <span className="font-semibold text-slate-800">Incluir otras instituciones en OTROS</span>
                <span className="mt-0.5 block text-slate-500">
                  Solo aplica al modo <strong>un solo informe</strong>. Desmarcado: solo filas de la institución
                  indicada arriba; OTROS = filas sin grado/grupo claro.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={buildReport}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generando…
                </>
              ) : exportMode === 'zip_by_institution' ? (
                'Generar ZIP (un informe por colegio)'
              ) : (
                'Generar y descargar Excel'
              )}
            </button>
            <button
              type="button"
              onClick={checkHealth}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
            >
              Comprobar API
            </button>
          </div>
          {apiMsg && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-800">
              {apiMsg}
            </p>
          )}
          {apiErr && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">
              {apiErr}
            </p>
          )}
            </section>

            {parsed && (
              <section className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Tabla — libro y vista por grado</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {parsed.names.length} hoja{parsed.names.length !== 1 ? 's' : ''} en el Excel · reordena como el
                  informe por <span className="font-medium text-emerald-800">grado‑grupo</span> cuando los datos lo
                  permiten
                </p>
              </div>
              <label className="block w-full text-sm font-semibold text-slate-800 sm:max-w-xs">
                Filtrar pestañas por nombre
                <input
                  type="search"
                  placeholder="Ej. ACT1"
                  className={inputClass}
                  value={sheetFilter}
                  onChange={(e) => setSheetFilter(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-indigo-900/80">Libro Excel · hoja</p>
            <div className="mt-1 max-h-40 overflow-y-auto overflow-x-auto rounded-xl border border-indigo-100 bg-indigo-50/40 p-2">
              <div className="flex min-w-max flex-wrap gap-2">
                {visibleSheetNames.map((name) => {
                  const n = parsed.sheets[name].rows.length
                  const active = name === activeSheet
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setActiveSheet(name)}
                      className={
                        active
                          ? 'rounded-xl bg-indigo-600 px-3.5 py-2 text-left text-xs font-semibold text-white shadow-md shadow-indigo-600/20'
                          : 'rounded-xl border border-indigo-200/80 bg-white px-3.5 py-2 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/70'
                      }
                      title="Pestaña del archivo .xlsx (puede incluir varias tablas)"
                    >
                      {name} <span className="tabular-nums opacity-90">({n})</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {canGroup && gradeSplit && (
              <>
                <p className="mt-5 text-xs font-medium uppercase tracking-wide text-emerald-900/90">
                  Vista por grado y grupo (como hojas del informe generado)
                </p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 shadow-inner">
                    <button
                      type="button"
                      onClick={() => setDataViewMode('excel')}
                      className={
                        dataViewMode === 'excel'
                          ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm'
                          : 'rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900'
                      }
                    >
                      Hoja completa
                    </button>
                    <button
                      type="button"
                      onClick={() => setDataViewMode('grado')}
                      className={
                        dataViewMode === 'grado'
                          ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-emerald-900 shadow-sm'
                          : 'rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900'
                      }
                    >
                      Por grado‑grupo
                    </button>
                  </div>
                  <p className="max-w-xl text-xs text-slate-500">
                    Cada pestaña verde agrupa filas con el mismo <strong className="text-slate-700">Grado</strong> y{' '}
                    <strong className="text-slate-700">número o letra de grupo</strong>, distinto de la pestaña del
                    Excel.
                  </p>
                </div>
                {dataViewMode === 'grado' && (
                  <div className="mt-3 max-h-44 overflow-y-auto overflow-x-auto rounded-xl border border-emerald-200/90 bg-emerald-50/50 p-2">
                    <div className="flex min-w-max flex-wrap gap-2">
                      {gradeTabOrder.map((seg) => {
                        const count =
                          seg === gradeSplit.otrosTitle
                            ? gradeSplit.otros.length
                            : gradeSplit.buckets[seg]?.length ?? 0
                        const active = activeGradeSegment === seg
                        return (
                          <button
                            key={seg}
                            type="button"
                            onClick={() => setActiveGradeSegment(seg)}
                            className={
                              active
                                ? 'rounded-xl bg-emerald-600 px-3.5 py-2 text-left text-xs font-bold text-white shadow-md shadow-emerald-600/25'
                                : 'rounded-xl border border-emerald-300/90 bg-white px-3.5 py-2 text-left text-xs font-semibold text-emerald-950 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50/90'
                            }
                            title={seg === gradeSplit.otrosTitle ? 'Institución no filtrada o sin grado/grupo' : `Grado‑grupo ${seg}`}
                          >
                            <span className="block font-mono tracking-tight">{seg}</span>
                            <span className="tabular-nums opacity-90">({count})</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            {visibleSheetNames.length === 0 && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                Ninguna hoja coincide con el filtro de nombres.
              </p>
            )}
            {activeMeta && activeSheet && visibleSheetNames.includes(activeSheet) && (
              <div className="mt-5 -mx-2 sm:mx-0">
                <SheetTable
                  key={tableSearchKey}
                  columns={activeMeta.columns}
                  rows={displayRows}
                  globalFilter={globalSearch[tableSearchKey] ?? ''}
                  onGlobalFilterChange={(value) =>
                    setGlobalSearch((prev) => ({ ...prev, [tableSearchKey]: value }))
                  }
                  onFilteredRowsChange={setStatsRows}
                />
                <TableStatsPanel
                  key={`stats-${tableSearchKey}`}
                  rows={statsRows}
                  columns={activeMeta.columns}
                  sheetName={activeSheet}
                  viewHint={statsViewHint}
                />
              </div>
            )}
              </section>
            )}

            {!parsed && (
              <section
                className={`rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center backdrop-blur-sm`}
              >
                <p className="text-base font-medium text-slate-600">
                  Sube el Excel del administrador para ver las hojas en tabla con búsqueda y orden.
                </p>
              </section>
            )}
        </>

        <footer className="mt-14 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-xs text-slate-500">
          <span>React · Vite · Tailwind</span>
          <span className="hidden sm:inline">·</span>
          <span>API FastAPI</span>
          <span className="hidden sm:inline">·</span>
          <span>Vista previa SheetJS</span>
        </footer>
      </div>
    </div>
  )
}
