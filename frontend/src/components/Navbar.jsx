import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-display font-bold text-lg tracking-tight">
          Leaf<span className="hl">let</span>
        </Link>

        {user && (
          <div className="flex items-center gap-3 relative">
            {/* Clicking avatar/name reveals the signed-in email */}
            <button
              onClick={() => setProfileOpen((v) => !v)}
              aria-expanded={profileOpen}
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-line/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
            >
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full border border-line" referrerPolicy="no-referrer" />
              )}
              <span className="text-sm text-graphite hidden sm:block">{user.displayName}</span>
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-11 z-30 w-64 bg-white border border-line rounded-xl shadow-lg p-4">
                  <p className="font-display font-semibold text-sm">{user.displayName}</p>
                  <p className="font-mono text-xs text-graphite mt-1 break-all"> {user.email}</p>
                </div>
              </>
            )}

            <button
              onClick={() => setConfirmOpen(true)}
              className="text-sm border border-line rounded px-3 py-1 hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Sign-out confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-40 bg-ink/30 grid place-items-center p-4"
          onClick={() => setConfirmOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-paper border border-line rounded-2xl w-full max-w-sm p-6">
            <h2 className="font-display font-bold text-lg mb-1">Sign out?</h2>
            <p className="text-sm text-graphite mb-5">
              Your progress is saved. You can pick up exactly where you left off next time.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="border border-line hover:border-ink rounded-lg px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
              >
                Stay signed in
              </button>
              <button
                onClick={() => { setConfirmOpen(false); logout() }}
                className="bg-pine hover:bg-pine-dark text-paper font-display font-semibold rounded-lg px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}