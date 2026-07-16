import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const fmtTime = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`)

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState(null)
  const [stats, setStats] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api.listCourses(), api.summary()])
    setCourses(c)
    setStats(s)
    // keep polling while any course is still generating
    if (c.some((x) => x.status === 'processing')) {
      clearTimeout(pollRef.current)
      pollRef.current = setTimeout(load, 4000)
    }
  }, [])

  useEffect(() => {
    load().catch((e) => setError(e.message))
    return () => clearTimeout(pollRef.current)
  }, [load])

  async function onFile(file) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      await api.uploadPdf(file)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onSearch(e) {
    e.preventDefault()
    if (query.trim().length < 2) return setResults(null)
    const r = await api.search(query.trim())
    setResults(r.results)
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-bold mb-1">
          Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-graphite mb-6">Pick up where you left off, or start a new course.</p>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Stat label="Courses" value={stats.total_courses} />
            <Stat label="Time learning" value={fmtTime(stats.time_spent_seconds)} />
            <Stat label="Streak" value={`${stats.streak_days} day${stats.streak_days === 1 ? '' : 's'}`} />
            <Stat
              label="Last quiz"
              value={stats.recent_quiz_scores[0]
                ? `${stats.recent_quiz_scores[0].score}/${stats.recent_quiz_scores[0].total}`
                : '—'}
            />
          </div>
        )}

        {/* Upload */}
        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
          className="border-2 border-dashed border-line rounded-xl p-8 text-center mb-8 bg-white/50"
        >
          <p className="font-display font-semibold mb-1">
            Drop a PDF here to <span className="hl">turn it into a course</span>
          </p>
          <p className="text-sm text-graphite mb-4">Books, papers, notes, documentation — up to 25 MB</p>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => onFile(e.target.files[0])} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-pine hover:bg-pine-dark disabled:opacity-60 text-paper font-display font-semibold rounded-lg px-5 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {uploading ? 'Uploading…' : 'Choose PDF'}
          </button>
          {error && <p className="text-brick text-sm mt-3">{error}</p>}
        </section>

        {/* Search */}
        <form onSubmit={onSearch} className="flex gap-2 mb-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chapters, topics, lessons…"
            className="flex-1 border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
          />
          <button className="border border-line rounded-lg px-4 hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-pine">
            Search
          </button>
        </form>
        {results && (
          <div className="mb-8 border border-line rounded-xl bg-white divide-y divide-line">
            {results.length === 0 && <p className="p-4 text-graphite text-sm">No matches. Try a different keyword.</p>}
            {results.map((r, i) => (
              <button key={i}
                onClick={() => navigate(`/courses/${r.course_id}${r.lesson_id ? `?lesson=${r.lesson_id}` : ''}`)}
                className="w-full text-left p-3 hover:bg-paper flex items-baseline gap-3">
                <span className="font-mono text-[10px] uppercase text-graphite w-16 shrink-0">{r.kind}</span>
                <span>
                  <span className="font-semibold">{r.title}</span>
                  {r.chapter && <span className="text-graphite text-sm"> · {r.chapter}</span>}
                  {r.snippet && <span className="block text-sm text-graphite">{r.snippet}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Courses */}
        <h2 className="font-display font-semibold mb-3">Your courses</h2>
        {!courses && <p className="text-graphite">Loading…</p>}
        {courses?.length === 0 && (
          <p className="text-graphite">No courses yet — upload your first PDF above.</p>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          {courses?.map((c) => c.status === 'failed' ? (
            <div key={c.id} className="border border-brick/40 rounded-xl bg-white p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-display font-semibold leading-snug">{c.title}</h3>
                <span className="font-mono text-[10px] text-brick border border-brick rounded px-1.5 py-0.5 shrink-0">FAILED</span>
              </div>
              <p className="text-xs text-graphite font-mono mb-2">{c.filename}</p>
              <p className="text-xs text-brick mb-3 break-words">
                {c.error ? `Generation failed: ${c.error}` : 'Generation failed. Retry, or delete and re-upload.'}
              </p>
              <div className="flex gap-2">
                <button onClick={() => api.retryCourse(c.id).then(load).catch((e) => setError(e.message))}
                  className="bg-pine hover:bg-pine-dark text-paper font-display font-semibold rounded-lg px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ink">
                  Retry
                </button>
                <button onClick={() => {
                  if (window.confirm(`Delete "${c.title}" and all its data?`))
                    api.deleteCourse(c.id).then(load).catch((e) => setError(e.message))
                }}
                  className="border border-brick text-brick hover:bg-brick hover:text-paper rounded-lg px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brick">
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <Link key={c.id} to={c.status === 'ready' ? `/courses/${c.id}` : '#'}
              className={`border border-line rounded-xl bg-white p-4 block hover:border-pine transition-colors ${c.status !== 'ready' ? 'pointer-events-none opacity-80' : ''}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-display font-semibold leading-snug">{c.title}</h3>
                {c.status === 'processing' && (
                  <span className="font-mono text-[10px] text-pine border border-pine rounded px-1.5 py-0.5 animate-pulse shrink-0">GENERATING</span>
                )}
              </div>
              <p className="text-xs text-graphite font-mono mb-3">
                {c.filename} {c.difficulty ? `· ${c.difficulty}` : ''} {c.estimated_minutes ? `· ~${c.estimated_minutes} min` : ''}
              </p>
              <div className="h-2 rounded bg-line overflow-hidden">
                <div className="h-full bg-marker border-r-2 border-pine" style={{ width: `${c.completion}%` }} />
              </div>
              <p className="text-xs text-graphite mt-1">
                {c.completed_lessons}/{c.total_lessons} lessons · {c.completion}% complete
                {c.time_spent_seconds ? ` · ${fmtTime(c.time_spent_seconds)}` : ''}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="border border-line rounded-xl bg-white p-4">
      <p className="font-mono text-2xl font-semibold">{value}</p>
      <p className="text-xs text-graphite uppercase tracking-wide">{label}</p>
    </div>
  )
}