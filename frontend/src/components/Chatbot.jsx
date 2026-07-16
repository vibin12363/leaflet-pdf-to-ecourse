import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { api } from '../lib/api'

const SUGGESTIONS = [
  'Summarize the first chapter',
  'Explain the hardest concept simply',
  'Quiz me on what I have learned',
  'What should I study next?',
]

export default function Chatbot({ courseId, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { api.chatHistory(courseId).then(setMessages).catch(() => {}) }, [courseId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: message }])
    setBusy(true)
    try {
      const { reply } = await api.sendChat(courseId, message)
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong: ${e.message}. Try again.` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/30" onClick={onClose}>
      <section onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-paper border-l border-line flex flex-col">
        <header className="flex items-center justify-between px-4 h-14 border-b border-line bg-white">
          <p className="font-display font-semibold">Learning <span className="hl">companion</span></p>
          <button onClick={onClose} aria-label="Close chat"
            className="border border-line rounded px-2 py-1 text-sm hover:border-ink">Close</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div>
              <p className="text-sm text-graphite mb-3">
                Ask anything about this course — the companion answers from your document.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="text-xs border border-line rounded-full px-3 py-1.5 bg-white hover:border-pine">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
              m.role === 'user' ? 'ml-auto bg-pine text-paper' : 'bg-white border border-line'}`}>
              {m.role === 'assistant'
                ? <div className="prose-lesson text-sm"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                : m.content}
            </div>
          ))}
          {busy && <p className="text-sm text-graphite animate-pulse">Thinking…</p>}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send() }}
          className="p-3 border-t border-line bg-white flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this course…"
            className="flex-1 border border-line rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine" />
          <button disabled={busy}
            className="bg-pine hover:bg-pine-dark disabled:opacity-60 text-paper rounded-lg px-4 font-display font-semibold text-sm">
            Send
          </button>
        </form>
      </section>
    </div>
  )
}
