import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Quiz({ courseId, chapterIndex, chapterTitle, onClose }) {
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getQuiz(courseId, chapterIndex)
      .then((q) => { setQuiz(q); setAnswers(Array(q.questions.length).fill('')) })
      .catch((e) => setError(e.message))
  }, [courseId, chapterIndex])

  async function submit() {
    setBusy(true)
    try {
      setResult(await api.submitQuiz(quiz.quiz_id, answers))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const setAns = (i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))

  return (
    <div className="fixed inset-0 z-30 bg-ink/30 grid place-items-center p-4" onClick={onClose}>
      <section onClick={(e) => e.stopPropagation()}
        className="bg-paper border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-graphite">Chapter quiz</p>
            <h2 className="font-display text-lg font-bold">{chapterTitle}</h2>
          </div>
          <button onClick={onClose} className="border border-line rounded px-2 py-1 text-sm hover:border-ink">Close</button>
        </div>

        {error && <p className="text-brick text-sm">{error}</p>}
        {!quiz && !error && <p className="text-graphite animate-pulse">Writing questions from this chapter…</p>}

        {quiz && !result && (
          <div className="space-y-5">
            {quiz.questions.map((q, i) => (
              <div key={i}>
                <p className="font-semibold mb-2">
                  <span className="font-mono text-xs text-graphite mr-2">{i + 1}.</span>{q.question}
                </p>
                {q.type === 'mcq' && q.options?.map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                    <input type="radio" name={`q${i}`} checked={answers[i] === o}
                      onChange={() => setAns(i, o)} className="accent-pine" />
                    {o}
                  </label>
                ))}
                {q.type === 'true_false' && ['True', 'False'].map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                    <input type="radio" name={`q${i}`} checked={answers[i] === o}
                      onChange={() => setAns(i, o)} className="accent-pine" />
                    {o}
                  </label>
                ))}
                {q.type === 'short_answer' && (
                  <input value={answers[i]} onChange={(e) => setAns(i, e.target.value)}
                    placeholder="Type a short answer…"
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pine" />
                )}
              </div>
            ))}
            <button onClick={submit} disabled={busy}
              className="bg-pine hover:bg-pine-dark disabled:opacity-60 text-paper font-display font-semibold rounded-lg px-5 py-2.5">
              {busy ? 'Scoring…' : 'Submit answers'}
            </button>
          </div>
        )}

        {result && (
          <div>
            <p className="font-display text-2xl font-bold mb-4">
              You scored <span className="hl">{result.score} / {result.total}</span>
            </p>
            <div className="space-y-4">
              {result.results.map((r, i) => (
                <div key={i} className={`border rounded-xl p-3 text-sm bg-white ${r.correct ? 'border-pine' : 'border-brick'}`}>
                  <p className="font-semibold mb-1">{r.question}</p>
                  <p>Your answer: <span className={r.correct ? 'text-pine font-semibold' : 'text-brick font-semibold'}>{r.your_answer || '—'}</span></p>
                  {!r.correct && <p>Correct answer: <span className="font-semibold">{r.correct_answer}</span></p>}
                  <p className="text-graphite mt-1">{r.explanation}</p>
                </div>
              ))}
            </div>
            <button onClick={onClose}
              className="mt-5 border border-line hover:border-ink rounded-lg px-4 py-2 text-sm">Back to course</button>
          </div>
        )}
      </section>
    </div>
  )
}
