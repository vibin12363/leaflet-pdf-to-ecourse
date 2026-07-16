import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, loading, loginWithGoogle, loginWithGithub } = useAuth()
  const [error, setError] = useState('')
  if (!loading && user) return <Navigate to="/" replace />

  const handle = (fn) => async () => {
    setError('')
    try { await fn() } catch (e) { setError(e.message) }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="max-w-md w-full">
        <p className="font-mono text-xs text-graphite mb-4">LEAFLET · PDF → E-COURSE</p>
        <h1 className="font-display text-4xl font-bold leading-tight mb-4">
          Any PDF becomes a <span className="hl">course you can finish</span>.
        </h1>
        <p className="text-graphite mb-8 leading-relaxed">
          Upload a textbook, paper or manual. Leaflet structures it into chapters and
          lessons, tracks your progress, quizzes you, and answers your questions —
          grounded in your document.
        </p>
        <div className="space-y-3">
          <button
            onClick={handle(loginWithGoogle)}
            className="w-full bg-pine hover:bg-pine-dark text-paper font-display font-semibold rounded-lg px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            Continue with Google
          </button>
          <button
            onClick={handle(loginWithGithub)}
            className="w-full bg-ink hover:bg-pine-dark text-paper font-display font-semibold rounded-lg px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
          >
            Continue with GitHub
          </button>
        </div>
        {error && <p className="text-brick text-sm mt-4">{error}</p>}
        <p className="text-xs text-graphite mt-4">
          Your documents and progress are private to your account.
        </p>
      </div>
    </main>
  )
}
