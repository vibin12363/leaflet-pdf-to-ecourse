import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import Navbar from '../components/Navbar'
import Chatbot from '../components/Chatbot'
import Quiz from '../components/Quiz'
import { api } from '../lib/api'

export default function Course() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [course, setCourse] = useState(null)
  const [error, setError] = useState('')
  const [lessonId, setLessonId] = useState(params.get('lesson') || null)
  const [lesson, setLesson] = useState(null)
  const [lessonLoading, setLessonLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [quizChapter, setQuizChapter] = useState(null)
  const [tocOpen, setTocOpen] = useState(false)
  const openedAt = useRef(Date.now())

  const flatLessons = useMemo(() => {
    if (!course) return []
    return course.chapters.flatMap((ch, ci) =>
      ch.topics.flatMap((tp) => tp.lessons.map((ls) => ({ ...ls, chapter: ch.title, ci }))))
  }, [course])

  useEffect(() => {
    api.getCourse(id)
      .then((c) => {
        setCourse(c)
        // resume: URL param > last lesson > first lesson
        const first = c.chapters?.[0]?.topics?.[0]?.lessons?.[0]?.id
        setLessonId((prev) => prev || c.last_lesson_id || first)
      })
      .catch((e) => setError(e.message))
  }, [id])

  useEffect(() => {
    if (!lessonId || !course) return
    setLesson(null)
    setLessonLoading(true)
    openedAt.current = Date.now()
    api.getLesson(id, lessonId)
      .then(setLesson)
      .catch((e) => setError(e.message))
      .finally(() => setLessonLoading(false))
    api.setResume(id, lessonId).catch(() => {})
  }, [id, lessonId, course])

  async function markComplete() {
    const seconds = Math.round((Date.now() - openedAt.current) / 1000)
    await api.completeLesson(id, lessonId, seconds)
    setCourse((c) => ({
      ...c,
      completed_lessons: [...new Set([...c.completed_lessons, lessonId])],
    }))
  }

  function goNext() {
    const idx = flatLessons.findIndex((l) => l.id === lessonId)
    if (idx >= 0 && idx < flatLessons.length - 1) setLessonId(flatLessons[idx + 1].id)
  }

  if (error) return <Shell><p className="text-brick">{error}</p></Shell>
  if (!course) return <Shell><p className="text-graphite">Loading course…</p></Shell>

  const completed = new Set(course.completed_lessons)
  const total = flatLessons.length
  const pct = total ? Math.round((completed.size / total) * 100) : 0
  const isDone = completed.has(lessonId)

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Link to="/" className="text-sm text-graphite hover:text-ink">← All courses</Link>
        <div className="mt-2 mb-6">
          <h1 className="font-display text-2xl font-bold leading-tight">{course.title}</h1>
          <p className="text-graphite mt-1 max-w-3xl">{course.description}</p>
          <p className="font-mono text-xs text-graphite mt-2">
            {course.difficulty} · ~{course.estimated_minutes} min · {total} lessons ·{' '}
            <span className="hl font-semibold text-ink">{pct}% complete</span>
          </p>
          {course.objectives?.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-display font-semibold">Objectives & prerequisites</summary>
              <div className="mt-2 grid sm:grid-cols-2 gap-4">
                <ul className="list-disc pl-5 space-y-1">
                  {course.objectives.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
                <ul className="list-disc pl-5 space-y-1 text-graphite">
                  {(course.prerequisites || []).map((p, i) => <li key={i}>{p}</li>)}
                  {(!course.prerequisites || course.prerequisites.length === 0) && <li>No prerequisites</li>}
                </ul>
              </div>
            </details>
          )}
        </div>

        <button onClick={() => setTocOpen((v) => !v)}
          className="lg:hidden mb-4 border border-line rounded px-3 py-1.5 text-sm">
          {tocOpen ? 'Hide contents' : 'Show contents'}
        </button>

        <div className="grid lg:grid-cols-[320px_1fr] gap-8 items-start">
          {/* Contents — styled like a book's contents page */}
          <aside className={`${tocOpen ? 'block' : 'hidden'} lg:block lg:sticky lg:top-20 border border-line rounded-xl bg-white p-4 max-h-[75vh] overflow-y-auto`}>
            <p className="font-mono text-[10px] uppercase tracking-widest text-graphite mb-3">Contents</p>
            {course.chapters.map((ch, ci) => (
              <div key={ch.id} className="mb-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display font-semibold text-sm">{ch.title}</h3>
                  <button onClick={() => setQuizChapter(ci)}
                    className="font-mono text-[10px] text-pine hover:underline shrink-0">QUIZ</button>
                </div>
                {ch.topics.map((tp) => (
                  <div key={tp.id} className="mt-1.5">
                    <p className="text-xs text-graphite italic">{tp.title}</p>
                    {tp.lessons.map((ls) => (
                      <button key={ls.id} onClick={() => { setLessonId(ls.id); setTocOpen(false) }}
                        className={`toc-row text-sm py-0.5 group ${ls.id === lessonId ? 'text-pine font-semibold' : ''}`}>
                        <span className={completed.has(ls.id) ? 'hl' : ''}>{ls.title}</span>
                        <span className="leader group-hover:border-ink" />
                        <span className="font-mono text-[10px] text-graphite">
                          {completed.has(ls.id) ? 'done' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </aside>

          {/* Lesson reading column */}
          <article className="max-w-[70ch]">
            {lessonLoading && (
              <div className="border border-line rounded-xl bg-white p-6">
                <p className="font-display font-semibold animate-pulse">Writing this lesson from your document…</p>
                <p className="text-sm text-graphite mt-1">First open takes ~15 seconds; it's saved after that.</p>
              </div>
            )}
            {lesson && (
              <div className="border border-line rounded-xl bg-white p-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                  {lesson.chapter} · {lesson.topic}
                </p>
                <h2 className="font-display text-xl font-bold mt-1 mb-4">{lesson.title}</h2>
                <div className="prose-lesson">
                  <ReactMarkdown>{lesson.explanation}</ReactMarkdown>
                </div>

                <Block title="Key takeaways" items={lesson.key_takeaways} highlight />
                <Block title="Important notes" items={lesson.important_notes} />
                <Block title="Real-world examples" items={lesson.real_world_examples} />

                <div className="mt-6 border-t border-line pt-4">
                  <p className="text-sm text-graphite italic mb-4">{lesson.summary}</p>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={markComplete} disabled={isDone}
                      className="bg-pine hover:bg-pine-dark disabled:opacity-50 text-paper font-display font-semibold rounded-lg px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ink">
                      {isDone ? 'Completed' : 'Mark complete'}
                    </button>
                    <button onClick={goNext}
                      className="border border-line hover:border-ink rounded-lg px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-pine">
                      Next lesson →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      </main>

      {/* Companion */}
      <button onClick={() => setChatOpen(true)}
        className="fixed bottom-5 right-5 bg-ink text-paper font-display font-semibold rounded-full px-5 py-3 shadow-lg hover:bg-pine focus:outline-none focus-visible:ring-2 focus-visible:ring-marker">
        Ask the companion
      </button>
      {chatOpen && <Chatbot courseId={id} onClose={() => setChatOpen(false)} />}
      {quizChapter !== null && (
        <Quiz courseId={id} chapterIndex={quizChapter}
          chapterTitle={course.chapters[quizChapter].title}
          onClose={() => setQuizChapter(null)} />
      )}
    </div>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">{children}</main>
    </div>
  )
}

function Block({ title, items, highlight }) {
  if (!items?.length) return null
  return (
    <div className="mt-5">
      <h3 className="font-display font-semibold text-sm mb-2">
        {highlight ? <span className="hl">{title}</span> : title}
      </h3>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  )
}
